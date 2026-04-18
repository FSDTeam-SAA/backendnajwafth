import mongoose from "mongoose";

const bookSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    author: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,   
    },
    description: {
      type: String,
      trim: true,
    },
    coverImage: {
      type: String, 
    },
    stock: {
      type: Boolean, 
        required: true,
    }
  },
  { timestamps: true },
);

export const Book = mongoose.model("Book", bookSchema);
