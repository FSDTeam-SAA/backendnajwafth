import express from "express";
import {
  createOrder,
  getOrders,
  getOrderById,
  getMyOrders,
  getLastAddress,
  updateOrderStatus,
} from "../controller/order.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create", protect, createOrder);
router.get("/", protect, getOrders);
router.get("/my-orders", protect, getMyOrders);
// Must be registered before "/:orderId" so it isn't captured as an id.
router.get("/last-address", protect, getLastAddress);
router.get("/:orderId", protect, getOrderById);
router.patch("/:orderId/status", protect, updateOrderStatus);

export default router;
