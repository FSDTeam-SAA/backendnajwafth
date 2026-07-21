import express from "express";
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  registerDeviceToken,
  removeDeviceToken,
} from "../controller/notification.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getMyNotifications);
router.get("/unread-count", getUnreadNotificationCount);
router.patch("/read-all", markAllNotificationsAsRead);
router.post("/device-token", registerDeviceToken);
router.delete("/device-token", removeDeviceToken);
router.patch("/:id/read", markNotificationAsRead);

export default router;
