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
  const rate = Number(req.body.adminCommissionRate);

  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new AppError(httpStatus.BAD_REQUEST, "Admin commission must be between 0 and 100");
  }

  const settings = await AdminSettings.findOneAndUpdate(
    { key: "global" },
    { key: "global", adminCommissionRate: rate },
    { new: true, upsert: true, runValidators: true },
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin settings updated",
    data: settings,
  });
});
