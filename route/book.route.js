import express from "express";

import { isSeller, protect } from "../middleware/auth.middleware.js";
import { createBook, deleteBook, getAllBooks, getSingleBook, updateBook } from "../controller/book.controller.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

router.post("/add", protect, isSeller, upload.single("coverImage"), createBook);
router.get("/", protect, isSeller, getAllBooks); 
router.get("/:id", protect, isSeller, getSingleBook); 
router.put("/:id", protect, isSeller, upload.single("coverImage"), updateBook);
router.patch("/:id", protect, isSeller, upload.single("coverImage"), updateBook);
router.delete("/:id", protect, isSeller, deleteBook);

export default router;
