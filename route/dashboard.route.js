import express from "express";
import { getAdminOverview, getSellerOverview } from "../controller/dashboard.controller.js";
import { isAdmin, protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/seller/overview", getSellerOverview);
router.get("/admin/overview", isAdmin, getAdminOverview);

export default router;
