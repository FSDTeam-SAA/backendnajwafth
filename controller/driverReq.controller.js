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
    shopId,
    shopName,
    phone,
    orderDate,
    totalAmount,
    customerName,
    item,
    location,
    orderId,
    price,
    message,
  } = req.body;

  const driverRequest = await DriverRequest.create({
    shopId,
    shopName,
    phone,
    orderDate,
    totalAmount,
    customerName,
    item,
    location,
    orderId,
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

  if (shopId && mongoose.Types.ObjectId.isValid(shopId)) {
    filter.shopId = shopId;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [requests, total] = await Promise.all([
    DriverRequest.find(filter)
      .populate("shopId", "name email")
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
    item,
    location,
    orderId,
    price,
    message,
  } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError(400, "Invalid request ID"));
  }

  const request = await DriverRequest.findByIdAndUpdate(
    id,
    {
      shopName,
      phone,
      orderDate,
      totalAmount,
      customerName,
      item,
      location,
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

  const request = await DriverRequest.findByIdAndDelete(id);

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
  );
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



