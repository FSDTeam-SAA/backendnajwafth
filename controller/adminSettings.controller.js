import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { AdminSettings } from "../model/adminSettings.model.js";
import { getAdminSettings } from "../utils/adminSettings.js";

export const getSettings = catchAsync(async (_req, res) => {
  const settings = await getAdminSettings();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin settings fetched",
    data: settings,
  });
});

export const updateSettings = catchAsync(async (req, res) => {
  const updates = { key: "global" };

  if (req.body.adminCommissionRate !== undefined) {
    const rate = Number(req.body.adminCommissionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new AppError(httpStatus.BAD_REQUEST, "Admin commission must be between 0 and 100");
    }
    updates.adminCommissionRate = rate;
  }

  if (req.body.deliveryFee !== undefined) {
    const deliveryFee = Number(req.body.deliveryFee);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      throw new AppError(httpStatus.BAD_REQUEST, "Delivery fee cannot be negative");
    }
    updates.deliveryFee = deliveryFee;
  }

  if (updates.adminCommissionRate === undefined && updates.deliveryFee === undefined) {
    throw new AppError(httpStatus.BAD_REQUEST, "No valid settings provided");
  }

  const settings = await AdminSettings.findOneAndUpdate(
    { key: "global" },
    updates,
    { new: true, upsert: true, runValidators: true },
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin settings updated",
    data: settings,
  });
});
