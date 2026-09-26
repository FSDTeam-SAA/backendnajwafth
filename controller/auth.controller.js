import AppError from "../errors/AppError.js";
import { createToken, verifyToken } from "../utils/authToken.js";
import catchAsync from "../utils/catchAsync.js";
import { generateOTP } from "../utils/commonMethod.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { sendEmail } from "../utils/sendEmail.js";
import { User } from "./../model/user.model.js";
import { getFirebaseAuth } from "../utils/firebaseAdmin.js";

const assertAccountActive = (user) => {
  if (user?.deletedAt) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "This account has been deleted or deactivated.",
    );
  }
};

const buildAuthResponseData = (user, accessToken, refreshToken) => {
  const userObj = user.toObject();

  delete userObj.password;
  delete userObj.refreshToken;
  delete userObj.password_reset_token;

  return {
    accessToken,
    refreshToken,
    role: user.role,
    _id: user._id,
    user: userObj,
  };
};

export const resolvePublicRegistrationRole = (role) => {
  const registrationRole = role || "buyer";
  if (!["buyer", "seller"].includes(registrationRole)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Public registration is only available for buyer or seller accounts",
    );
  }
  return registrationRole;
};

export const register = catchAsync(async (req, res) => {
  const { name, email, phone, password, confirmPassword, role } = req.body;
  const registrationRole = resolvePublicRegistrationRole(role);

  if (!name || !email || !password) {
    throw new AppError(httpStatus.FORBIDDEN, "Please fill in all fields");
  }

  if (confirmPassword && password !== confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password and confirm password do not match"
    );
  }

  const checkUser = await User.findOne({ email: email });
  if (checkUser)
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Email already exists, please try another email"
    );

  const user = await User.create({
    name,
    email,
    phone,
    password,
    role: registrationRole,
    verificationInfo: { token: "", verified: true },
  });

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
  user.refreshToken = refreshToken;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User registered successfully",
    data: buildAuthResponseData(user, accessToken, refreshToken),
  });
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  assertAccountActive(user);
  if (
    user?.password &&
    !(await User.isPasswordMatched(password, user.password))
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Password is not correct");
  }
  if (!(await User.isOTPVerified(user._id))) {
    const otp = generateOTP();
    const jwtPayloadOTP = {
      otp: otp,
    };

    // const otptoken = createToken(
    //   jwtPayloadOTP,
    //   process.env.OTP_SECRET,
    //   process.env.OTP_EXPIRE
    // );
    // user.verificationInfo.token = otptoken;
    // await user.save();
    // await sendEmail(user.email, "Registerd Account", `Your OTP is ${otp}`);

    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: "OTP is not verified, please verify your OTP",
      data: { email: user.email },
    });
  }
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

  user.refreshToken = refreshToken;
  await user.save();

  res.cookie("refreshToken", refreshToken, {
    secure: true,
    httpOnly: true,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User Logged in successfully",
    data: buildAuthResponseData(user, accessToken, refreshToken),
  });
});

export const socialLogin = catchAsync(async (req, res) => {
  const { idToken, provider, name } = req.body;
  const supportedProviders = new Set(["google.com", "apple.com"]);

  if (!idToken || !supportedProviders.has(provider)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A valid Google or Apple identity token is required",
    );
  }

  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    throw new AppError(
      httpStatus.SERVICE_UNAVAILABLE,
      "Social sign-in is temporarily unavailable",
    );
  }

  let identity;
  try {
    identity = await firebaseAuth.verifyIdToken(idToken, true);
  } catch {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid social sign-in token");
  }

  const tokenProvider = identity.firebase?.sign_in_provider;
  if (tokenProvider !== provider || !identity.email || !identity.email_verified) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "The social account email could not be verified",
    );
  }

  const normalizedEmail = identity.email.trim().toLowerCase();
  let user = await User.findOne({
    $or: [
      { firebaseUid: identity.uid },
      { "socialIdentities.uid": identity.uid },
      { email: normalizedEmail },
    ],
  });

  assertAccountActive(user);

  if (user && user.role !== "buyer") {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "This account is not authorized for the buyer application",
    );
  }

  if (!user) {
    user = await User.create({
      name: (name || identity.name || normalizedEmail.split("@")[0]).trim(),
      email: normalizedEmail,
      firebaseUid: identity.uid,
      authProvider: provider,
      socialIdentities: [{ uid: identity.uid, provider }],
      role: "buyer",
      verificationInfo: { token: "", verified: true },
    });
  } else {
    user.firebaseUid = identity.uid;
    user.authProvider = provider;
    if (
      !(user.socialIdentities || []).some(
        (socialIdentity) => socialIdentity.uid === identity.uid,
      )
    ) {
      user.socialIdentities ||= [];
      user.socialIdentities.push({ uid: identity.uid, provider });
    }
    user.verificationInfo = { token: "", verified: true };
    if (!user.name && (name || identity.name)) {
      user.name = (name || identity.name).trim();
    }
  }

  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  };
  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET,
    process.env.JWT_ACCESS_EXPIRES_IN,
  );
  const refreshToken = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN,
  );

  user.refreshToken = refreshToken;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: buildAuthResponseData(user, accessToken, refreshToken),
  });
});

export const forgetPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  assertAccountActive(user);
  const otp = generateOTP();
  const jwtPayloadOTP = {
    otp: otp,
  };

  const otptoken = createToken(
    jwtPayloadOTP,
    process.env.OTP_SECRET,
    process.env.OTP_EXPIRE
  );
  user.password_reset_token = otptoken;
  await user.save();

  /////// TODO: SENT EMAIL MUST BE DONE
  sendEmail(user.email, "Reset Password", `Your OTP is ${otp}`);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent to your email",
    data: "",
  });
});

export const verifyOTPForReset = catchAsync(async (req, res) => {
  const { otp, email } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  assertAccountActive(user);
  if (!user.password_reset_token) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password reset token is invalid"
    );
  }
  const verify = await verifyToken(
    user.password_reset_token,
    process.env.OTP_SECRET
  );
  if (verify.otp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP Matched successfully",
    data: {},
  });
});

export const resetPassword = catchAsync(async (req, res) => {
  const { password, otp, email } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  assertAccountActive(user);
  if (!user.password_reset_token) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password reset token is invalid"
    );
  }
  const verify = await verifyToken(
    user.password_reset_token,
    process.env.OTP_SECRET
  );
  if (verify.otp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }
  user.password = password;
  user.password_reset_token = "";
  await user.save();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully",
    data: {},
  });
});

export const verifyEmail = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  assertAccountActive(user);
  if (otp) {
    const savedOTP = verifyToken(
      user.verificationInfo.token,
      process.env.OTP_SECRET
    );
    console.log(savedOTP);
    if (otp === savedOTP.otp) {
      user.verificationInfo.token = "";
      await user.save();

      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "User verified",
        data: "",
      });
    } else {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
    }
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP is required");
  }
});

export const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Old password and new password are required"
    );
  }
  if (oldPassword === newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Old password and new password cannot be same"
    );
  }
  const user = await User.findById({ _id: req.user?._id });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  user.password = newPassword;
  await user.save();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed",
    data: "",
  });
});

export const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError(400, "Refresh token is required");
  }

  const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(decoded._id);
  if (!user || user.refreshToken !== refreshToken) {
    throw new AppError(401, "Invalid refresh token");
  }
  assertAccountActive(user);
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

  const refreshToken1 = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRES_IN
  );
  user.refreshToken = refreshToken1;
  await user.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Token refreshed successfully",
    data: { accessToken: accessToken, refreshToken: refreshToken1 },
  });
});

export const logout = catchAsync(async (req, res) => {
  const user = req.user?._id;
  await User.findByIdAndUpdate(
    user,
    req.user?.role === "driver"
      ? { refreshToken: "", isOnline: false }
      : { refreshToken: "" },
    { new: true },
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully",
    data: "",
  });
});
