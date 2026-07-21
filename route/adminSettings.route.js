import express from "express";
import { getSettings, updateSettings } from "../controller/adminSettings.controller.js";
import { isAdmin, protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect, isAdmin);

router.get("/", getSettings);
router.patch("/", updateSettings);

export default router;
