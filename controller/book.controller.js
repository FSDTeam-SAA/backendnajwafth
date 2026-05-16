import mongoose from "mongoose";
import AppError from "../errors/AppError.js";
import { Book } from "../model/book.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import { Review } from "../model/review.model.js";

async function resolveCoverImage(req) {
  if (req.file) {
    const upload = await uploadOnCloudinary(req.file.buffer);
    return upload.secure_url;
  }

  if (typeof req.body.coverImage === "string" && req.body.coverImage.trim()) {
    return req.body.coverImage.trim();
  }

  return undefined;
}

export const createBook = catchAsync(async (req, res) => {
  const { title, author, category, price, description, stock } = req.body;
  const coverImage = await resolveCoverImage(req);

  const book = await Book.create({
    shopId: req.user._id,
    title,
    author,
    category,
    price,
    description,
    coverImage,
    stock: stock === "true" || stock === true,
  });

  return sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Book created successfully",
    data: book,
  });
});

export const getAllBooks = catchAsync(async (req, res) => {
  const {
    search,
    category,
    stock,
    minPrice,
    maxPrice,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
    shopId,
  } = req.query;

  const filter = {
    // shopId: req.user._id,
  };

  if (shopId && mongoose.Types.ObjectId.isValid(shopId)) {
    filter.shopId = shopId;
  } else if (req.user?.role === "seller") {
    filter.shopId = req.user._id;
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { author: { $regex: search, $options: "i" } },
    ];
  }

  if (category && mongoose.Types.ObjectId.isValid(category)) {
    filter.category = category;
  }

  if (stock !== undefined) {
    filter.stock = stock === "true";
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortOptions = {
    [sortBy]: sortOrder === "asc" ? 1 : -1,
  };


  

  const [books, total] = await Promise.all([
    Book.find(filter)
      .populate("shopId", "name email")
      .populate("category", "name")
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit)),
    Book.countDocuments(filter),
  ]);

  //need to here add each book review and rating 
let book = await Promise.all(
  books.map(async (book) => {
    const reviews = await Review.find({ book: book._id })
      .populate("user", "name");

    const avgRating =
      reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length || 0;

    const bookObj = book.toObject();

    bookObj.reviews = reviews;
    bookObj.avgRating = Number(avgRating.toFixed(1));

    return bookObj;
  })
);


  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Books fetched successfully",
    data: {
      books: book,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPage: Math.ceil(total / Number(limit)),
      },
    },
  });
});

export const getSingleBook = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const filter = { _id: id };
  if (req.user?.role === "seller") {
    filter.shopId = req.user._id;}

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError(400, "Invalid book ID"));
  }


  const book = await Book.findOne(filter)
    .populate("shopId", "name email")
    .populate("category", "name");

  if (!book) {
    return next(new AppError(404, "Book not found"));

  }

    const reviews = await Review.find({ book: book._id })
      .populate("user", "name");
    const avgRating =
      reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length || 0;
  const bookObj = book.toObject();

  bookObj.reviews = reviews;
  bookObj.avgRating = Number(avgRating.toFixed(1));

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Book fetched successfully",
    data: bookObj,
  });
});

export const updateBook = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError(400, "Invalid book ID"));
  }

  const updates = {};
  const fields = ["title", "author", "category", "price", "description"];

  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  });

  if (req.body.stock !== undefined) {
    updates.stock = req.body.stock === "true" || req.body.stock === true;
  }

  const coverImage = await resolveCoverImage(req);
  if (coverImage !== undefined) {
    updates.coverImage = coverImage;
  }

  const book = await Book.findOneAndUpdate(
    { _id: id, shopId: req.user._id },
    updates,
    { new: true, runValidators: true },
  );

  if (!book) {
    return next(new AppError(404, "Book not found"));
  }

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Book updated successfully",
    data: book,
  });
});

export const deleteBook = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError(400, "Invalid book ID"));
  }

  const book = await Book.findOneAndDelete({ _id: id, shopId: req.user._id });

  if (!book) {
    return next(new AppError(404, "Book not found"));
  }

  return sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Book deleted successfully",
    data: null,
  });
});
