import express from "express";
import {
  register,
  login,
  forgetPassword,
  verifyOTP,
  resetPassword,
  refreshToken,
  logout,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Sign up
router.post("/register", register);

// Sign in
router.post("/login", login);

// Forgot password -> send OTP
router.post("/forgot-password", forgetPassword);

// Verify OTP
router.post("/verify-otp", verifyOTP);

// Reset new password
router.post("/reset-password", resetPassword);

// Refresh access token
router.post("/refresh-token", refreshToken);

// Logout
router.post("/logout", protect, logout);

export default router;