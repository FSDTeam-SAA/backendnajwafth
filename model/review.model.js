import mongoose, { Schema } from "mongoose";

const reviewSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        book: {
            type: Schema.Types.ObjectId,
            ref: "Book",
        },
        shop: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        order: {
            type: Schema.Types.ObjectId,
            ref: "Order",
        },
        rating: {
            type: Number,
            required: true,
            min: [1, "Rating must be at least 1"],
            max: [5, "Rating must be at most 5"],
        },
        comment: {
            type: String,
            trim: true,
        },
    },
    { timestamps: true },
);

export const Review = mongoose.model("Review", reviewSchema);
