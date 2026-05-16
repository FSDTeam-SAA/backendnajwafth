import express from "express";
import { isAdmin, isSeller, protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
import {
  getProfile,
  updateProfile,
  changePassword,
  getSellerCustomers,
  getAdminDrivers,
  achievement,
} from "../controller/user.controller.js";
import { contactUs } from "../controller/contactUs.controller.js";
import { createReview } from "../controller/review.controller.js";

const router = express.Router();

router.get("/me", protect, getProfile);
router.patch("/me", protect, upload.single("avatar"), updateProfile);
router.patch("/change-password", protect, changePassword);
router.get("/seller/customers", protect, isSeller, getSellerCustomers);
router.get("/drivers", protect, isAdmin, getAdminDrivers);


router.post("/contact-us",contactUs)

router.post("/write-review", protect, createReview);

router.get("/achievements", achievement);


export default router;
