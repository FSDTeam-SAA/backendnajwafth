import express from "express";
import {
  createPayment,
  confirmPayment,
} from "../controller/payment.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create", protect, createPayment);
router.post("/confirm", protect, confirmPayment);

export default router;
