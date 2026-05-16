import express from "express";
import {
  addCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoryTree,
} from "../controller/category.controller.js";
import { isAdmin, protect } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.post("/add", protect, isAdmin, upload.single("image"), addCategory);
router.get("/", protect, getCategories);
router.get("/tree/all", protect, getCategoryTree);
router.put("/:id", protect, isAdmin, upload.single("image"), updateCategory);
router.delete("/:id", protect, isAdmin, deleteCategory);

export default router;
