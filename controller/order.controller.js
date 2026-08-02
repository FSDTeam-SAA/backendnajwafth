import httpStatus from "http-status";
import mongoose from "mongoose";
import { Order as OrderModel } from "../model/order.model.js";
import { paymentInfo } from "../model/payment.model.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { nanoid } from "nanoid";

import { Book } from "../model/book.model.js";
import { createNotification, getUserDisplayName } from "../utils/notification.js";
import { getAdminCommissionRate, getDeliveryFee } from "../utils/adminSettings.js";
import { DriverRequest } from "../model/driveReq.model.js";

const formatOrderStatus = (status = "") => status.replace(/_/g, " ");

const orderStatusAliases = {
  in_progress: "processing",
  shipped: "picked",
};

const orderStatuses = new Set(["pending", "processing", "picked", "delivered"]);

const normalizeOrderStatus = (status = "pending") => {
  const normalized = orderStatusAliases[status] || status;
  return orderStatuses.has(normalized) ? normalized : "pending";
};

const getOrderStatusFilter = (status) => {
  const normalized = normalizeOrderStatus(status);
  if (normalized === "processing") return { $in: ["processing", "in_progress"] };
  if (normalized === "picked") return { $in: ["picked", "shipped"] };
  return normalized;
};

const parseRequestedQuantity = (value) => {
  const quantity = Number(value || 0);

  if (!Number.isInteger(quantity)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Quantity must be a whole number");
  }

  return quantity;
};

const normalizePaymentStatus = (orderStatus, paymentStatus) => {
  if (paymentStatus === "complete") return "complete";
  if (paymentStatus === "failed") return "failed";
  return orderStatus || paymentStatus || "pending";
};

const attachPaymentDetails = (order, payment) => {
  const orderData = typeof order.toObject === "function" ? order.toObject() : order;
  const paymentStatus = normalizePaymentStatus(orderData.paymentStatus, payment?.paymentStatus);
  const status = normalizeOrderStatus(orderData.status);

  return {
    ...orderData,
    status,
    payment: payment || null,
    paymentMethod: payment?.paymentMethod || orderData.paymentMethod || (payment ? "Stripe" : ""),
    paymentStatus,
  };
};

const getLatestPaymentsByOrderId = async (orderIds) => {
  if (orderIds.length === 0) return new Map();

  const payments = await paymentInfo
    .find({ orderId: { $in: orderIds }, type: "order" })
    .sort({ createdAt: -1 })
    .select("orderId paymentMethod paymentStatus transactionId price")
    .lean();

  const paymentByOrderId = new Map();
  for (const payment of payments) {
    const key = payment.orderId?.toString();
    if (key && !paymentByOrderId.has(key)) {
      paymentByOrderId.set(key, payment);
    }
  }

  return paymentByOrderId;
};

export const createOrder = catchAsync(async (req, res) => {
  const { items, address, name, phone, addressDetails } = req.body;
  const customer = req.user._id;

  let totalAmount = 0;
  const orderItems = [];
  for (let item of items) {
    const requestedQuantity = parseRequestedQuantity(item.quantity);
    const product = await Book.findById(item.product.toString());
    if (!product || requestedQuantity < 1 || Number(product.stock) < requestedQuantity) {
      console.log("Product not found or out of stock:", product);
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Insufficient stock for ${product?.title}`,
      );
    }
    totalAmount += product.price * requestedQuantity;
    orderItems.push({
      product: item.product,
      quantity: requestedQuantity,
      price: product.price,
      vendor: product.shopId,
    });
  }

  const orderId = `ORD${nanoid(6)}`;
  console.log("Creating order with ID:", orderItems, "for customer:", customer);
  const vendor = orderItems[0].vendor;
  const [shippingFee, adminCommissionRate] = await Promise.all([
    getDeliveryFee(),
    getAdminCommissionRate(),
  ]);
  const adminCommission = Number((totalAmount * (adminCommissionRate / 100)).toFixed(2));

  const order = await OrderModel.create({
    orderId,
    items: orderItems,
    totalAmount,
    shippingFee,
    adminCommissionRate,
    adminCommission,
    customer,
    vendor,
    address,
    recipientName: name,
    phone,
    addressDetails,
    expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await Promise.all([
    createNotification({
      user: customer,
      actor: customer,
      order: order._id,
      type: "order_created",
      title: "Order placed",
      message: `Your order ${order.orderId} has been placed successfully.`,
      metadata: {
        orderId: order.orderId,
        status: order.status,
      },
    }),
    createNotification({
      user: order.vendor,
      actor: customer,
      order: order._id,
      type: "new_order",
      title: "New order received",
      message: `${getUserDisplayName(req.user)} placed order ${order.orderId}.`,
      metadata: {
        orderId: order.orderId,
        status: order.status,
      },
    }),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Order created",
    data: order,
  });
});

export const getOrders = catchAsync(async (req, res) => {
  const { status, vendorId, page = 1, limit = 10 } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const query = { customer: req.user._id };
  if (status) query.status = getOrderStatusFilter(status);

  if (req.user.role === "seller") {
    query.vendor = req.user._id;
    delete query.customer;
  } else if (req.user.role === "admin") {
    delete query.customer;
    if (vendorId && mongoose.Types.ObjectId.isValid(vendorId)) {
      query.vendor = vendorId;
    }
  }

  const [orders, total] = await Promise.all([
    OrderModel.find(query)
      .populate("items.product", "title price photos rating")
      .populate("customer", "name email phone")
      .populate("vendor", "name storeName")
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .sort({ createdAt: -1 }),
    OrderModel.countDocuments(query),
  ]);
  const paymentByOrderId = await getLatestPaymentsByOrderId(orders.map((order) => order._id));
  const ordersWithPayment = orders.map((order) =>
    attachPaymentDetails(order, paymentByOrderId.get(order._id.toString())),
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Orders fetched",
    data: {
      orders: ordersWithPayment,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
});

export const getOrderById = catchAsync(async (req, res) => {
  const order = await OrderModel.findOne({ orderId: req.params.orderId })
    .populate("items.product", "title price photos")
    .populate("customer", "name email phone")
    .populate("vendor", "name storeName");

  if (!order) throw new AppError(httpStatus.NOT_FOUND, "Order not found");

  // Role check for access
  if (
    req.user.role === "user" &&
    order?.customer?._id.toString() !== req.user._id.toString()
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  } else if (
    req.user.role === "seller" &&
    order.vendor._id.toString() !== req.user._id.toString()
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  const payment = await paymentInfo
    .findOne({ orderId: order._id, type: "order" })
    .sort({ createdAt: -1 })
    .select("paymentMethod paymentStatus transactionId price")
    .lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Order fetched",
    data: attachPaymentDetails(order, payment),
  });
});

export const updateOrderStatus = catchAsync(async (req, res) => {
  if (req.user.role !== "driver" && req.user.role !== "admin" && req.user.role !== "seller") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Only seller, driver, or admin can update status",
    );
  }

  const { status, trackingNumber } = req.body;
  const order = await OrderModel.findOne({ orderId: req.params.orderId })
    .populate("items.product")
    .populate("customer", "name firstName lastName email")
    .populate("vendor", "name firstName lastName email storeName");

  if (!order) {
    throw new AppError(httpStatus.NOT_FOUND, "Order not found");
  }

  if (
    req.user.role === "seller" &&
    order.vendor._id.toString() !== req.user._id.toString()
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  if (
    req.user.role === "driver" &&
    order.driver?.toString() !== req.user._id.toString()
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  if (status !== undefined) {
    order.status = normalizeOrderStatus(status);
  } else {
    order.status = normalizeOrderStatus(order.status);
  }

  if (trackingNumber !== undefined) {
    order.trackingNumber = trackingNumber;
  }

  await order.save();

  if (order.status === "delivered") {
    await DriverRequest.updateMany(
      { orderId: order._id, status: "accepted" },
      { $set: { status: "completed" } },
    );
  }

  const readableStatus = formatOrderStatus(order.status);
  const trackingMessage = order.trackingNumber
    ? ` Tracking number: ${order.trackingNumber}.`
    : "";

  await createNotification({
    user: order.customer._id,
    actor: req.user._id,
    order: order._id,
    type: "order_status_updated",
    title: `Order ${readableStatus}`,
    message: `Your order ${order.orderId} is now ${readableStatus}.${trackingMessage}`,
    metadata: {
      orderId: order.orderId,
      status: order.status,
      trackingNumber: order.trackingNumber,
    },
  });

  if (
    req.user.role === "admin" &&
    order.vendor?._id?.toString() !== req.user._id.toString()
  ) {
    await createNotification({
      user: order.vendor._id,
      actor: req.user._id,
      order: order._id,
      type: "order_status_updated",
      title: "Order status changed",
      message: `Order ${order.orderId} was updated to ${readableStatus} by admin.${trackingMessage}`,
      metadata: {
        orderId: order.orderId,
        status: order.status,
        trackingNumber: order.trackingNumber,
      },
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Order status updated",
    data: order,
  });
});

// Returns the recipient + delivery address from the user's most recent order
// so the checkout form can pre-fill it next time.
export const getLastAddress = catchAsync(async (req, res) => {
  const lastOrder = await OrderModel.findOne({
    customer: req.user._id,
    $or: [
      { recipientName: { $exists: true, $ne: "" } },
      { "addressDetails.line1": { $exists: true, $ne: "" } },
      { address: { $exists: true, $ne: "" } },
    ],
  })
    .sort({ createdAt: -1 })
    .select("recipientName phone address addressDetails")
    .lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: lastOrder ? "Last address fetched" : "No saved address",
    data: lastOrder
      ? {
          name: lastOrder.recipientName || "",
          phone: lastOrder.phone || "",
          address: lastOrder.address || "",
          addressDetails: lastOrder.addressDetails || {},
        }
      : null,
  });
});

export const getMyOrders = catchAsync(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;
  const filter = {
    customer: req.user._id,
    status: { $in: ["pending", "processing", "picked", "delivered", "in_progress", "shipped"] },
  };

  const [orders, total] = await Promise.all([
    OrderModel.find(filter)
      .populate("items.product", "title price coverImage")
      .populate("customer", "name email")
      .populate("vendor", "name storeName address")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    OrderModel.countDocuments(filter),
  ]);
  const paymentByOrderId = await getLatestPaymentsByOrderId(orders.map((order) => order._id));
  const ordersWithPayment = orders.map((order) =>
    attachPaymentDetails(order, paymentByOrderId.get(order._id.toString())),
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Orders fetched",
    data: {
      orders: ordersWithPayment,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
});
