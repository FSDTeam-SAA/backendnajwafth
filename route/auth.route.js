import express from "express";
import {
  register,
  registerDriver,
  login,
  forgetPassword,
  // verifyOTP,
  resetPassword,
  refreshToken,
  logout,
  verifyOTPForReset,
  socialLogin,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Sign up
router.post("/register", register);

// The driver app registers through its own endpoint; buyer/seller registration
// keeps the existing role restrictions.
router.post("/driver-register", registerDriver);

// Sign in
router.post("/login", login);

// Sign in with a Firebase-verified Google or Apple identity.
router.post("/social-login", socialLogin);

// Forgot password -> send OTP
router.post("/forgot-password", forgetPassword);

// Verify OTP
router.post("/verify-otp", verifyOTPForReset);

// Reset new password
router.post("/reset-password", resetPassword);

// Refresh access token
router.post("/refresh-token", refreshToken);

// Logout
router.post("/logout", protect, logout);

export default router;
