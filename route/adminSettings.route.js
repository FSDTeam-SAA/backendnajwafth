import express from "express";
import { getSettings, updateSettings } from "../controller/adminSettings.controller.js";
import { isAdmin, protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Reading settings (e.g. the delivery fee shown at checkout) is available to
// any authenticated user; only admins may change them.
router.get("/", protect, getSettings);
router.patch("/", protect, isAdmin, updateSettings);

export default router;
