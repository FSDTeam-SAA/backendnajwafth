import express from "express";
import {
  getShops,
  getMyShop,
  updateMyShop,
  getShopById,
  pendingShops,
  updateShopStatus,
} from "../controller/shop.controller.js";
import { isAdmin, protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.use(protect);

router.get("/", isAdmin, getShops);
router.get("/pending", isAdmin, pendingShops);
router.get("/my", getMyShop);
router.get("/:id", getShopById);
router.put("/update-shop",upload.fields([{ name: "banner", maxCount: 3 }, { name: "certificate", maxCount: 1 },]),updateMyShop,);
router.patch("/:shopId/status", isAdmin, updateShopStatus);

export default router;
