import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";

const sanitizeUser = (user) => ({
  _id: user._id,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  role: user.role,
  authProvider: user.authProvider,
  googleId: user.googleId,
  isEmailVerified: user.isEmailVerified,
  isBlocked: user.isBlocked,
  avatar: user.avatar,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshTokenHash -otp.hash -otp.expiresAt -otp.attempts -otp.lastSentAt -otp.purpose"
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile fetched successfully",
    data: sanitizeUser(user),
  });
});

export const updateProfile = catchAsync(async (req, res) => {
  const { fullName } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (fullName !== undefined) {
    if (!fullName.trim()) {
      throw new AppError(httpStatus.BAD_REQUEST, "Full name is required");
    }
    user.fullName = fullName.trim();
  }

  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    user.avatar = {
      public_id: upload.public_id,
      url: upload.secure_url,
    };
  }

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully",
    data: sanitizeUser(user),
  });
});

export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Current password, new password and confirm password are required"
    );
  }

  if (newPassword !== confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "New password and confirm password do not match"
    );
  }

  if (currentPassword === newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "New password must be different from current password"
    );
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const isMatched = await user.isPasswordMatched(currentPassword);
  if (!isMatched) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "Current password is incorrect"
    );
  }

  user.password = newPassword;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully",
    data: null,
  });
});