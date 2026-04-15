import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { createToken, verifyToken } from "../utils/authToken.js";
import { sendEmail } from "../utils/sendEmail.js";
import { User } from "../model/user.model.js";

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

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
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const generateAccessAndRefreshToken = async (user) => {
  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  };

  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN
  );

  const refreshToken = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN
  );

  await user.setRefreshToken(refreshToken);
  await user.save();

  return { accessToken, refreshToken };
};

export const register = catchAsync(async (req, res) => {
  const { fullName, email, phone, password, confirmPassword, role } = req.body;

  if (!fullName || !email || !phone || !password || !confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Full name, email, phone, password and confirm password are required"
    );
  }

  if (password !== confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password and confirm password do not match"
    );
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Email already exists, please try another email"
    );
  }

  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    phone,
    password,
    role: role && ["buyer", "driver"].includes(role) ? role : "buyer",
    authProvider: "LOCAL",
    isEmailVerified: true,
  });

  const tokens = await generateAccessAndRefreshToken(user);

  res.cookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Account created successfully",
    data: {
      user: sanitizeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Email and password are required"
    );
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password +refreshTokenHash"
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.isBlocked) {
    throw new AppError(httpStatus.FORBIDDEN, "Your account is blocked");
  }

  const isPasswordCorrect = await user.isPasswordMatched(password);
  if (!isPasswordCorrect) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
  }

  const tokens = await generateAccessAndRefreshToken(user);

  res.cookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Login successful",
    data: {
      user: sanitizeUser(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
});

export const forgetPassword = catchAsync(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email is required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+otp.hash +otp.expiresAt +otp.attempts +otp.lastSentAt +otp.purpose"
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const now = new Date();

  if (user.otp?.lastSentAt) {
    const diffInSeconds = Math.floor((now - user.otp.lastSentAt) / 1000);
    if (diffInSeconds < 60) {
      throw new AppError(
        httpStatus.TOO_MANY_REQUESTS,
        "Please wait before requesting another OTP"
      );
    }
  }

  const otp = generateOTP();
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
  const otpHash = await bcrypt.hash(otp, saltRounds);

  user.otp = {
    hash: otpHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
    lastSentAt: now,
    purpose: "RESET_PASSWORD",
  };

  await user.save();

  await sendEmail(user.email, "Reset Password OTP", `Your OTP is ${otp}`);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent successfully",
    data: {
      email: user.email,
    },
  });
});

export const verifyOTP = catchAsync(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email and OTP are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+otp.hash +otp.expiresAt +otp.attempts +otp.lastSentAt +otp.purpose"
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.otp?.purpose !== "RESET_PASSWORD") {
    throw new AppError(httpStatus.BAD_REQUEST, "No valid OTP request found");
  }

  if (!user.otp?.hash || !user.otp?.expiresAt || user.otp.expiresAt < new Date()) {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP expired or invalid");
  }

  if (user.otp.attempts >= 5) {
    throw new AppError(
      httpStatus.TOO_MANY_REQUESTS,
      "Too many invalid OTP attempts"
    );
  }

  const isOtpMatched = await user.isOtpValid(otp);

  if (!isOtpMatched) {
    user.otp.attempts += 1;
    await user.save();

    throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }

  const resetToken = createToken(
    { _id: user._id, email: user.email, purpose: "RESET_PASSWORD" },
    process.env.JWT_RESET_PASSWORD_SECRET,
    process.env.JWT_RESET_PASSWORD_EXPIRES_IN || "10m"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP verified successfully",
    data: {
      email: user.email,
      resetToken,
    },
  });
});

export const resetPassword = catchAsync(async (req, res) => {
  const { email, resetToken, newPassword, confirmPassword } = req.body;

  if (!email || !resetToken || !newPassword || !confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Email, reset token, new password and confirm password are required"
    );
  }

  if (newPassword !== confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "New password and confirm password do not match"
    );
  }

  let decoded;
  try {
    decoded = verifyToken(
      resetToken,
      process.env.JWT_RESET_PASSWORD_SECRET
    );
  } catch (error) {
    throw new AppError(httpStatus.BAD_REQUEST, "Reset token is invalid or expired");
  }

  if (
    decoded?.purpose !== "RESET_PASSWORD" ||
    decoded?.email !== email.toLowerCase()
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid reset session");
  }

  const user = await User.findById(decoded._id).select(
    "+otp.hash +otp.expiresAt +otp.attempts +otp.lastSentAt +otp.purpose"
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  user.password = newPassword;
  user.otp = {
    hash: "",
    expiresAt: null,
    attempts: 0,
    lastSentAt: null,
    purpose: "",
  };
  await user.clearRefreshToken();
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully",
    data: null,
  });
});

export const refreshToken = catchAsync(async (req, res) => {
  const incomingRefreshToken =
    req.body.refreshToken || req.cookies?.refreshToken;

  if (!incomingRefreshToken) {
    throw new AppError(httpStatus.BAD_REQUEST, "Refresh token is required");
  }

  let decoded;
  try {
    decoded = verifyToken(
      incomingRefreshToken,
      process.env.JWT_REFRESH_SECRET
    );
  } catch (error) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
  }

  const user = await User.findById(decoded._id).select("+refreshTokenHash");

  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
  }

  const isValidRefreshToken = await user.isRefreshTokenValid(
    incomingRefreshToken
  );

  if (!isValidRefreshToken) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
  }

  const tokens = await generateAccessAndRefreshToken(user);

  res.cookie("refreshToken", tokens.refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Token refreshed successfully",
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
});

export const logout = catchAsync(async (req, res) => {
  const userId = req.user?._id;

  if (userId) {
    const user = await User.findById(userId).select("+refreshTokenHash");
    if (user) {
      await user.clearRefreshToken();
      await user.save();
    }
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully",
    data: null,
  });
});