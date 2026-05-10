import express from "express";

import { protect } from "../middleware/auth.middleware.js";
import { createBook, deleteBook, getAllBooks, getSingleBook, updateBook } from "../controller/book.controller.js";

const router = express.Router();

router.post("/add", protect, createBook);
router.get("/", protect, getAllBooks); 
router.get("/:id", protect, getSingleBook); 
router.put("/:id", protect, updateBook);
router.delete("/:id", protect, deleteBook);

export default router;
