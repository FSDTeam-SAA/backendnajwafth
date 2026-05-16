import mongoose from "mongoose";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { DriverRequest } from "../model/driveReq.model.js";
import { Order } from "../model/order.model.js";


/**
 * CREATE DRIVER REQUEST
 */
export const createDriverRequest = catchAsync(async (req, res) => {
  const {
    shopName,
    shopPhone,
    phone,
    orderDate,
    totalAmount,
    customerName,
    totalItems,
    item,
    location,
    customerLocation,
    orderId,
    price,
    message,
  } = req.body;

  let resolvedOrderId;
  if (typeof orderId === "string" && orderId.trim()) {
    const order = await Order.findOne({
      orderId: orderId.trim(),
      vendor: req.user._id,
    });

    if (!order) {
      throw new AppError(404, "Order not found for this seller");
    }

    resolvedOrderId = order._id;

    const existingRequest = await DriverRequest.findOne({
      shopId: req.user._id,
      orderId: resolvedOrderId,
    });

    if (existingRequest) {
      throw new AppError(400, "Driver request already exists for this order");
    }
  }

  const driverRequest = await DriverRequest.create({
    shopId: req.user._id,
    shopName,
    phone: shopPhone || phone,
    orderDate,
    totalAmount,
    customerName,
    item: item || totalItems,
    location: customerLocation || location,
    orderId: resolvedOrderId,
    price,
    message,
  });

  return sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Driver request created successfully",
    data: driverRequest,
  });
});


/**
 * ADMIN - GET ALL DRIVER REQUESTS
 * Supports:
 * ?shopId=
 * ?page=1
 * ?limit=10
 */
export const getAllDriverRequests = catchAsync(async (req, res) => {
  const {
    shopId,
    page = 1,
    limit = 10,
  } = req.query;

  const filter = {};

  if (req.user.role === "seller") {
    filter.shopId = req.user._id;
  } else if (shopId && mongoose.Types.ObjectId.isValid(shopId)) {
    filter.shopId = shopId;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [requests, total] = await Promise.all([
    DriverRequest.find(filter)
      .populate("shopId", "name email")
      .populate("driver", "name email phone avatar")
      .populate("orderId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),

    DriverRequest.countDocuments(filter),
  ]);

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Driver requests fetched successfully",
    data: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPage: Math.ceil(total / limit),
       requests,
    },
  });
});


/**
 * SHOP-WISE DRIVER REQUESTS
 */
export const getShopDriverRequests = catchAsync(async (req, res, next) => {
  const { shopId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(shopId)) {
    return next(new AppError(400, "Invalid shop ID"));
  }

  if (
    req.user.role === "seller" &&
    req.user._id.toString() !== shopId
  ) {
    return next(new AppError(403, "Access denied"));
  }

  const requests = await DriverRequest.find({ shopId })
    .populate("orderId")
    .sort({ createdAt: -1 });

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Shop driver requests fetched successfully",
    data: requests,
  });
});


/**
 * GET SINGLE DRIVER REQUEST
 */
export const getSingleDriverRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError(400, "Invalid request ID"));
  }

  const request = await DriverRequest.findById(id)
    .populate("shopId", "name email")
    .populate("orderId");

  if (!request) {
    return next(new AppError(404, "Driver request not found"));
  }

  if (
    req.user.role === "seller" &&
    request.shopId?._id?.toString() !== req.user._id.toString()
  ) {
    return next(new AppError(403, "Access denied"));
  }

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Driver request fetched successfully",
    data: request,
  });
});


/**
 * UPDATE DRIVER REQUEST
 */
export const updateDriverRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const {
    shopName,
    phone,
    orderDate,
    totalAmount,
    customerName,
    totalItems,
    item,
    location,
    customerLocation,
    orderId,
    price,
    message,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError(400, "Invalid request ID"));
  }

  const filter =
    req.user.role === "seller"
      ? { _id: id, shopId: req.user._id }
      : { _id: id };

  const request = await DriverRequest.findOneAndUpdate(
    filter,
    {
      shopName,
      phone,
      orderDate,
      totalAmount,
      customerName,
      item: item || totalItems,
      location: customerLocation || location,
      orderId,
      price,
      message,
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!request) {
    return next(new AppError(404, "Driver request not found"));
  }

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Driver request updated successfully",
    data: request,
  });
});


/**
 * DELETE DRIVER REQUEST
 */
export const deleteDriverRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError(400, "Invalid request ID"));
  }

  const filter =
    req.user.role === "seller"
      ? { _id: id, shopId: req.user._id }
      : { _id: id };

  const request = await DriverRequest.findOneAndDelete(filter);

  if (!request) {
    return next(new AppError(404, "Driver request not found"));
  }

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Driver request deleted successfully",
    data: null,
  });
});


export const assignDriverToRequest = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { driverId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(driverId)) {
    return next(new AppError(400, "Invalid request ID or driver ID"));
  }

  const request = await DriverRequest.findByIdAndUpdate(
    id,
    { driver: driverId },
    { new: true }
  )
    .populate("driver", "name email phone avatar")
    .populate("orderId");
  if (!request) {
    return next(new AppError(404, "Driver request not found"));
  }
  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Driver assigned to request successfully",
    data: request,
  });
});


export const updateDriverRequestStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError(400, "Invalid request ID"));
  }
  if (!["pending", "accepted", "rejected"].includes(status)) {
    return next(new AppError(400, "Invalid status value"));
  }
  const request = await DriverRequest.findById(id);
  if (!request) {
    return next(new AppError(404, "Driver request not found"));
  }

  if (status === "accepted") {
    const order = await Order.findById(request.orderId);
    if (order) {
      order.driver = request.driver;
      await order.save();
    }
  }
  const updatedRequest = await DriverRequest.findByIdAndUpdate(
    id,
    { status },
    { new: true }
  );
  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Driver request status updated successfully",
    data: updatedRequest,
  }); 
});

export const getDriverRequestsByDriver = catchAsync(async (req, res, next) => {
  const { driverId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(driverId)) {
    return next(new AppError(400, "Invalid driver ID"));
  }
  const requests = await DriverRequest.find({ driver: driverId })
    .populate("shopId", "name email")
    .populate("orderId")
    .sort({ createdAt: -1 });
  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Driver requests for driver fetched successfully",
    data: requests,
  });
});



