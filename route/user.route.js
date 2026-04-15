import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
import {
  getProfile,
  updateProfile,
  changePassword,
} from "../controller/user.controller.js";

const router = express.Router();

router.get("/me", protect, getProfile);
router.patch("/me", protect, upload.single("avatar"), updateProfile);
router.patch("/change-password", protect, changePassword);

export default router;