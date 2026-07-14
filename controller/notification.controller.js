import httpStatus from "http-status";
import mongoose from "mongoose";
import AppError from "../errors/AppError.js";
import { Notification } from "../model/notification.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
// import {
//   emitNotificationAllRead,
//   emitNotificationRead,
// } from "../utils/notification.js";

const buildNotificationQuery = (req) => {
  const query = { user: req.user._id };

  if (req.query.type) {
    query.type = req.query.type;
  }

  if (req.query.isRead !== undefined) {
    query.isRead = req.query.isRead === "true";
  }

  return query;
};

const notificationPopulateOptions = [
  { path: "actor", select: "name firstName lastName email storeName avatar", model: "User" },
  { path: "product", select: "title thumbnail photos", model: "Book" },
  { path: "order", select: "orderId status totalAmount", model: "Order" },
  { path: "chat", select: "seller user", model: "Chat" },
  { path: "shop", select: "name shopStatus", model: "Shop" },
  { path: "service", select: "title verified", model: "Service" },
  { path: "subscription", select: "planName", model: "Subscription" },
  { path: "payment", select: "transactionId type price paymentStatus", model: "paymentInfo" },
  { path: "contactUs", select: "subject email", model: "ContactUs" },
];

const populateRegisteredNotificationRefs = (query) => {
  return notificationPopulateOptions.reduce((currentQuery, option) => {
    if (!mongoose.models[option.model]) {
      return currentQuery;
    }

    return currentQuery.populate(option.path, option.select);
  }, query);
};

export const getMyNotifications = catchAsync(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const skip = (page - 1) * limit;
  const query = buildNotificationQuery(req);

  const [notifications, total, unreadCount] = await Promise.all([
    populateRegisteredNotificationRefs(Notification.find(query))
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Notification.countDocuments(query),
    Notification.countDocuments({
      user: req.user._id,
      isRead: false,
    }),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notifications fetched successfully",
    data: {
      notifications,
      unreadCount,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

export const getUnreadNotificationCount = catchAsync(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    user: req.user._id,
    isRead: false,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Unread notification count fetched successfully",
    data: { unreadCount },
  });
});

export const markNotificationAsRead = catchAsync(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, "Notification not found");
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
    // await emitNotificationRead(notification);
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification marked as read",
    data: notification,
  });
});

export const markAllNotificationsAsRead = catchAsync(async (req, res) => {
  const readAt = new Date();

  const result = await Notification.updateMany(
    {
      user: req.user._id,
      isRead: false,
    },
    {
      $set: {
        isRead: true,
        readAt,
      },
    },
  );

  // await emitNotificationAllRead(req.user._id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All notifications marked as read",
    data: {
      modifiedCount: result.modifiedCount,
    },
  });
});
