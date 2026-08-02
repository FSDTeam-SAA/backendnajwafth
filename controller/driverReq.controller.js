import mongoose from "mongoose";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { DriverRequest } from "../model/driveReq.model.js";
import { Order } from "../model/order.model.js";
import { User } from "../model/user.model.js";
import {
  createNotification,
  notifyAdmins,
  getUserDisplayName,
} from "../utils/notification.js";

const getOrderLabel = (request) =>
  request.orderId?.orderId || request._id.toString();

const activeDriverRequestStatuses = ["pending", "accepted"];

const getAvailableDriverIds = async () => {
  const busyDriverIds = await DriverRequest.distinct("driver", {
    driver: { $exists: true, $ne: null },
    status: { $in: activeDriverRequestStatuses },
  });

  const drivers = await User.find({
    role: "driver",
    isOnline: true,
    _id: { $nin: busyDriverIds },
  }).select("_id");

  return drivers.map((driver) => driver._id);
};


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

  try {
    const availableDriverIds = await getAvailableDriverIds();
    if (availableDriverIds.length) {
      const orderLabel =
        typeof orderId === "string" && orderId.trim()
          ? orderId.trim()
          : driverRequest._id.toString();
      await createNotification({
        userIds: availableDriverIds,
        actor: req.user._id,
        order: resolvedOrderId || null,
        type: "driver_request_new",
        title: "New delivery request",
        message: `A new delivery request is available from ${shopName || "a shop"}.`,
        metadata: {
          driverRequestId: driverRequest._id.toString(),
          orderId: orderLabel,
        },
      });
    }
  } catch (error) {
    console.warn("Failed to notify available drivers:", error.message);
  }

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
 * ?status=pending|accepted|rejected
 * ?page=1
 * ?limit=10
 */
export const getAllDriverRequests = catchAsync(async (req, res) => {
  const {
    shopId,
    status,
    page = 1,
    limit = 10,
  } = req.query;

  const filter = {};
  const baseFilter = {};

  if (req.user.role === "seller") {
    filter.shopId = req.user._id;
    baseFilter.shopId = req.user._id;
  } else if (shopId && mongoose.Types.ObjectId.isValid(shopId)) {
    filter.shopId = shopId;
    baseFilter.shopId = shopId;
  }

  if (req.user.role === "driver") {
    filter.status = "pending";
    filter.dismissedDrivers = { $ne: req.user._id };
    filter.$or = [
      { driver: { $exists: false } },
      { driver: null },
      { driver: req.user._id },
    ];
    Object.assign(baseFilter, filter);
  } else if (["pending", "accepted", "rejected", "completed"].includes(status)) {
    filter.status = status;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [requests, total, totalRequests, totalPending, totalCompleted] = await Promise.all([
    DriverRequest.find(filter)
      .populate("shopId", "name email")
      .populate("driver", "name email phone avatar")
      .populate("orderId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),

    DriverRequest.countDocuments(filter),
    DriverRequest.countDocuments(baseFilter),
    DriverRequest.countDocuments({ ...baseFilter, status: "pending" }),
    DriverRequest.countDocuments({ ...baseFilter, status: "completed" }),
  ]);

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Driver requests fetched successfully",
    data: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPage: Math.ceil(total / Number(limit)),
      metrics: {
        totalRequests,
        totalPending,
        totalCompleted,
      },
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
  const driverId = req.user.role === "driver" ? req.user._id : req.body.driverId;

  if (req.user.role !== "admin" && req.user.role !== "driver") {
    return next(new AppError(403, "Only admin or driver can assign a driver"));
  }

  if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(driverId)) {
    return next(new AppError(400, "Invalid request ID or driver ID"));
  }

  const request = await DriverRequest.findById(id);
  if (!request) {
    return next(new AppError(404, "Driver request not found"));
  }

  if (
    req.user.role === "driver" &&
    request.driver &&
    request.driver.toString() !== req.user._id.toString()
  ) {
    return next(new AppError(409, "Driver request is already assigned"));
  }

  if (req.user.role === "driver" && request.status !== "pending") {
    return next(new AppError(400, "Only pending requests can be claimed"));
  }

  const previousDriverId = request.driver?.toString();

  if (req.user.role === "driver") {
    if (!req.user.isOnline) {
      return next(new AppError(409, "Go online before accepting requests"));
    }

    const existingWork = await DriverRequest.exists({
      _id: { $ne: request._id },
      driver: req.user._id,
      status: { $in: activeDriverRequestStatuses },
    });
    if (existingWork) {
      return next(new AppError(409, "Driver already has an active request"));
    }

    const claimed = await DriverRequest.findOneAndUpdate(
      {
        _id: request._id,
        status: "pending",
        $or: [
          { driver: { $exists: false } },
          { driver: null },
          { driver: req.user._id },
        ],
      },
      { $set: { driver: req.user._id } },
      { new: true, runValidators: true },
    );
    if (!claimed) {
      return next(new AppError(409, "Driver request is no longer available"));
    }
  } else if (previousDriverId !== driverId.toString()) {
    const driver = await User.findOne({
      _id: driverId,
      role: "driver",
      isOnline: true,
    });
    if (!driver) {
      return next(new AppError(409, "Only online drivers can be assigned"));
    }

    const existingWork = await DriverRequest.exists({
      _id: { $ne: request._id },
      driver: driverId,
      status: { $in: activeDriverRequestStatuses },
    });
    if (existingWork) {
      return next(new AppError(409, "Driver already has an active request"));
    }

    request.driver = driverId;
    await request.save();

    if (request.status === "accepted" && request.orderId) {
      await Order.findByIdAndUpdate(request.orderId, {
        $set: { driver: driverId },
      });
    }
  }

  const updatedRequest = await DriverRequest.findById(request._id)
    .populate("driver", "name email phone avatar")
    .populate("orderId");

  if (req.user.role === "admin" && previousDriverId !== driverId.toString()) {
    try {
      await createNotification({
        user: driverId,
        actor: req.user._id,
        order: updatedRequest.orderId?._id || null,
        type: "driver_request_assigned",
        title: "New delivery request assigned",
        message: `You've been assigned a delivery for order ${getOrderLabel(
          updatedRequest
        )} from ${updatedRequest.shopName || "a shop"}. Open the app to accept or decline.`,
        metadata: {
          driverRequestId: updatedRequest._id.toString(),
          orderId: getOrderLabel(updatedRequest),
        },
      });
    } catch (error) {
      console.warn("Failed to notify driver of assignment:", error.message);
    }
  }

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Driver assigned to request successfully",
    data: updatedRequest,
  });
});


export const updateDriverRequestStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError(400, "Invalid request ID"));
  }
  if (!["pending", "accepted", "rejected", "completed"].includes(status)) {
    return next(new AppError(400, "Invalid status value"));
  }
  const request = await DriverRequest.findById(id);
  if (!request) {
    return next(new AppError(404, "Driver request not found"));
  }

  if (req.user.role !== "admin" && req.user.role !== "driver") {
    return next(new AppError(403, "Only admin or driver can update status"));
  }

  if (req.user.role === "driver") {
    if (status === "completed") {
      return next(
        new AppError(
          403,
          "Delivery completion is controlled by the order status",
        ),
      );
    }

    if (
      request.driver &&
      request.driver.toString() !== req.user._id.toString()
    ) {
      return next(
        new AppError(
          status === "accepted" ? 409 : 403,
          status === "accepted"
            ? "Driver request is no longer available"
            : "Access denied",
        ),
      );
    }

    if (status === "rejected") {
      const rejectingDriver = request.driver
        ? await User.findById(request.driver).select("name email")
        : null;

      await DriverRequest.findByIdAndUpdate(id, {
        $addToSet: { dismissedDrivers: req.user._id },
        $unset: { driver: 1 },
        $set: { status: "pending" },
      });

      const updatedRequest = await DriverRequest.findById(id)
        .populate("driver", "name email phone avatar")
        .populate("orderId");

      try {
        const driverName = getUserDisplayName(rejectingDriver);
        const orderLabel = getOrderLabel(updatedRequest);

        await createNotification({
          user: request.shopId,
          actor: req.user._id,
          order: updatedRequest.orderId?._id || null,
          type: "driver_request_rejected",
          title: "Driver declined delivery request",
          message: `${driverName} declined the delivery for order ${orderLabel}. It has been returned to the pool for reassignment.`,
          metadata: {
            driverRequestId: updatedRequest._id.toString(),
            orderId: orderLabel,
          },
        });

        await notifyAdmins({
          actor: req.user._id,
          order: updatedRequest.orderId?._id || null,
          type: "driver_request_rejected",
          title: "Driver declined a delivery request",
          message: `${driverName} declined delivery for order ${orderLabel} (shop: ${
            updatedRequest.shopName || "unknown"
          }). Please reassign a driver.`,
          metadata: {
            driverRequestId: updatedRequest._id.toString(),
            orderId: orderLabel,
          },
        });
      } catch (error) {
        console.warn("Failed to notify of driver rejection:", error.message);
      }

      return sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Driver request skipped successfully",
        data: updatedRequest,
      });
    }

    if (status === "accepted") {
      if (!req.user.isOnline) {
        return next(new AppError(409, "Go online before accepting requests"));
      }

      const existingWork = await DriverRequest.exists({
        _id: { $ne: request._id },
        driver: req.user._id,
        status: { $in: activeDriverRequestStatuses },
      });
      if (existingWork) {
        return next(new AppError(409, "Driver already has an active request"));
      }

      const acceptedRequest = await DriverRequest.findOneAndUpdate(
        {
          _id: request._id,
          status: "pending",
          $or: [
            { driver: { $exists: false } },
            { driver: null },
            { driver: req.user._id },
          ],
        },
        { $set: { driver: req.user._id, status: "accepted" } },
        { new: true, runValidators: true },
      );

      if (!acceptedRequest) {
        return next(new AppError(409, "Driver request is no longer available"));
      }

      request.driver = acceptedRequest.driver;
      request.status = acceptedRequest.status;
    }
  }

  if (status === "accepted") {
    const order = await Order.findById(request.orderId);
    if (order) {
      order.driver = request.driver;
      await order.save();
    }
  }

  if (!(req.user.role === "driver" && status === "accepted")) {
    request.status = status;
    await request.save();
  }

  const updatedRequest = await DriverRequest.findById(id)
    .populate("driver", "name email phone avatar")
    .populate("orderId");

  if (status === "accepted") {
    try {
      const driverName = getUserDisplayName(updatedRequest.driver);
      const orderLabel = getOrderLabel(updatedRequest);

      await createNotification({
        user: request.shopId,
        actor: updatedRequest.driver?._id || req.user._id,
        order: updatedRequest.orderId?._id || null,
        type: "driver_request_accepted",
        title: "Driver accepted your delivery request",
        message: `${driverName} has accepted the delivery for order ${orderLabel}.`,
        metadata: {
          driverRequestId: updatedRequest._id.toString(),
          orderId: orderLabel,
        },
      });
    } catch (error) {
      console.warn("Failed to notify shop of driver acceptance:", error.message);
    }
  }

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
