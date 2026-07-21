import httpStatus from "http-status";
import mongoose from "mongoose";
import { Book } from "../model/book.model.js";
import { DriverRequest } from "../model/driveReq.model.js";
import { Order } from "../model/order.model.js";
import { paymentInfo } from "../model/payment.model.js";
import { Shop } from "../model/shop.model.js";
import { User } from "../model/user.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { getAdminCommissionRate } from "../utils/adminSettings.js";

const buildMonthlyDeliveryActivity = (orders = []) => {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const counts = new Array(12).fill(0);

  for (const order of orders) {
    const monthIndex = new Date(order.createdAt).getMonth();
    counts[monthIndex] += 1;
  }

  return labels.map((label, index) => ({
    label,
    value: counts[index],
  }));
};

const buildWeeklyRevenue = (orders = []) => {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const revenueMap = new Map(labels.map((label) => [label, 0]));

  for (const order of orders) {
    const date = new Date(order.createdAt);
    const label = labels[(date.getDay() + 6) % 7];
    revenueMap.set(label, (revenueMap.get(label) || 0) + (order.totalAmount || 0));
  }

  return labels.map((label) => ({
    label,
    value: Number((revenueMap.get(label) || 0).toFixed(2)),
  }));
};

const buildTopSellingBooks = (orders = []) => {
  const bookMap = new Map();

  for (const order of orders) {
    for (const item of order.items || []) {
      const product = item.product;
      const productId = product?._id?.toString?.() || product?.toString?.();
      if (!productId) continue;

      const current = bookMap.get(productId) || {
        _id: productId,
        title: product?.title,
        author: product?.author,
        price: product?.price,
        coverImage: product?.coverImage,
        category: product?.category,
        soldCount: 0,
      };

      current.soldCount += item.quantity || 0;
      bookMap.set(productId, current);
    }
  }

  return Array.from(bookMap.values())
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, 10);
};

export const getSellerOverview = catchAsync(async (req, res) => {
  const sellerId = req.user._id;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [bookCount, allSellerOrders, recentOrders] = await Promise.all([
    Book.countDocuments({ shopId: sellerId }),
    Order.find({ vendor: sellerId })
      .populate("customer", "name email phone avatar")
      .populate("items.product", "title author price coverImage category")
      .sort({ createdAt: -1 }),
    Order.find({ vendor: sellerId })
      .populate("customer", "name email phone avatar")
      .populate("items.product", "title author price coverImage category")
      .sort({ createdAt: -1 })
      .limit(8),
  ]);

  const deliveredOrders = allSellerOrders.filter((order) => order.status === "delivered");
  const totalRevenue = allSellerOrders.reduce(
    (sum, order) => sum + (order.totalAmount || 0),
    0,
  );
  const totalAdminCommission = allSellerOrders.reduce(
    (sum, order) => {
      if (typeof order.adminCommission === "number" && order.adminCommission > 0) {
        return sum + order.adminCommission;
      }
      const commissionRate = Number(order.adminCommissionRate ?? 0);
      return sum + ((order.totalAmount || 0) * (commissionRate / 100));
    },
    0,
  );
  const netRevenue = totalRevenue - totalAdminCommission;
  const ordersToday = allSellerOrders.filter(
    (order) => new Date(order.createdAt) >= startOfToday,
  ).length;
  const totalCustomers = new Set(
    allSellerOrders.map((order) => order.customer?._id?.toString()).filter(Boolean),
  ).size;
  const topBooks = buildTopSellingBooks(allSellerOrders);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Seller dashboard overview fetched successfully",
    data: {
      metrics: {
        totalBooks: bookCount,
        totalOrders: allSellerOrders.length,
        ordersToday,
        totalUsers: totalCustomers,
        totalCompletedOrders: deliveredOrders.length,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalAdminCommission: Number(totalAdminCommission.toFixed(2)),
        netRevenue: Number(netRevenue.toFixed(2)),
      },
      salesAnalysis: buildWeeklyRevenue(allSellerOrders),
      recentOrders,
      topBooks,
    },
  });
});

export const getAdminOverview = catchAsync(async (_req, res) => {
  const [recentSellerUsers, totalBookstores, drivers, driverRequests, completedOrders, recentOrders, recentDriverRequests] = await Promise.all([
    User.find({ role: "seller" }).sort({ createdAt: -1 }).limit(8).select("name email phone avatar address username"),
    User.countDocuments({ role: "seller" }),
    User.find({ role: "driver" }).sort({ createdAt: -1 }).limit(8).select("name email phone avatar createdAt"),
    DriverRequest.find()
      .populate("shopId", "name email phone")
      .populate("driver", "name email phone")
      .populate("orderId")
      .sort({ createdAt: -1 }),
    Order.find({ status: "delivered" }).sort({ createdAt: -1 }),
    Order.find()
      .populate("customer", "name email phone")
      .populate("vendor", "name email phone")
      .sort({ createdAt: -1 })
      .limit(8),
    DriverRequest.find()
      .populate("shopId", "name email phone")
      .populate("driver", "name email phone")
      .sort({ createdAt: -1 })
      .limit(8),
  ]);

  const recentShopDocs = await Shop.find({
    owner: { $in: recentSellerUsers.map((seller) => seller._id) },
  }).select("name owner");

  const shopByOwner = new Map(
    recentShopDocs.map((shop) => [shop.owner?.toString(), shop]),
  );

  const recentShops = recentSellerUsers.map((seller) => {
    const shop = shopByOwner.get(seller._id.toString());
    return {
      _id: seller._id,
      name: shop?.name || seller.name || seller.username || "Books store",
    };
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin dashboard overview fetched successfully",
    data: {
      metrics: {
        totalBookstores,
        totalDrivers: drivers.length,
        totalDriverRequests: driverRequests.length,
        totalCompleted: completedOrders.length,
      },
      deliveryActivity: buildMonthlyDeliveryActivity(completedOrders),
      recentOrders,
      recentDriverRequests,
      recentShops,
      recentDrivers: drivers,
    },
  });
});

export const getAdminProfitOverview = catchAsync(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const skip = (page - 1) * limit;
  const currentCommissionRate = await getAdminCommissionRate();
  const completedPayments = await paymentInfo
    .find({ type: "order", paymentStatus: "complete", orderId: { $ne: null } })
    .sort({ createdAt: -1 })
    .select("orderId price adminCommission adminCommissionRate paymentMethod paymentStatus transactionId")
    .lean();
  const paymentByOrderId = new Map();

  for (const payment of completedPayments) {
    const key = payment.orderId?.toString();
    if (key && !paymentByOrderId.has(key)) {
      paymentByOrderId.set(key, payment);
    }
  }

  const paidOrderIds = Array.from(paymentByOrderId.keys()).map((id) => new mongoose.Types.ObjectId(id));
  const paidOrderFilter = { _id: { $in: paidOrderIds } };

  const [orders, total, allPaidOrders] = await Promise.all([
    Order.find(paidOrderFilter)
      .populate("customer", "name email phone")
      .populate("vendor", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(paidOrderFilter),
    Order.find(paidOrderFilter).select("totalAmount adminCommission adminCommissionRate"),
  ]);

  const getSavedCommission = (orderData, payment) => {
    if (typeof orderData.adminCommission === "number" && orderData.adminCommission > 0) {
      return Number(orderData.adminCommission.toFixed(2));
    }
    if (typeof payment?.adminCommission === "number" && payment.adminCommission > 0) {
      return Number(payment.adminCommission.toFixed(2));
    }

    const savedRate = Number(orderData.adminCommissionRate ?? payment?.adminCommissionRate ?? currentCommissionRate);
    return Number(((orderData.totalAmount || 0) * (savedRate / 100)).toFixed(2));
  };

  const totalOrderAmount = Number(
    allPaidOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0).toFixed(2),
  );
  const totalCommission = Number(
    allPaidOrders
      .reduce((sum, order) => {
        const orderData = order.toObject();
        const payment = paymentByOrderId.get(orderData._id.toString());
        return sum + getSavedCommission(orderData, payment);
      }, 0)
      .toFixed(2),
  );
  const mappedOrders = orders.map((order) => {
    const orderData = order.toObject();
    const payment = paymentByOrderId.get(orderData._id.toString());
    const orderCommissionRate = Number(orderData.adminCommissionRate ?? payment?.adminCommissionRate ?? currentCommissionRate);
    const orderCommission = getSavedCommission(orderData, payment);

    return {
      ...orderData,
      payment,
      paymentStatus: payment?.paymentStatus || "complete",
      paymentMethod: payment?.paymentMethod || "Stripe",
      adminCommissionRate: orderCommissionRate,
      adminCommission: orderCommission,
    };
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin profit overview fetched successfully",
    data: {
      metrics: {
        totalOrders: total,
        totalOrderAmount,
        totalCommission,
        adminTotalProfit: totalCommission,
        adminCommissionRate: currentCommissionRate,
      },
      orders: mappedOrders,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});
