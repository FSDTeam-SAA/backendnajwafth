import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import { Review } from "../model/review.model.js";
import { Order as OrderModel } from "../model/order.model.js";
import httpStatus from "http-status";


export const createReview = catchAsync(async (req, res) => {

    const {shop, book,order, rating, comment} = req.body;
    const user = req.user._id;
    if(!shop && !book){
        throw new AppError(httpStatus.BAD_REQUEST, "Either shop or book must be provided");
    }
    if(book){
        // Check if user has purchased the book
        const hasPurchased = await OrderModel.exists({
            customer: user,
            "items.product": book,
            status: { $in: ["delivered", "completed"] },
        });
        if (!hasPurchased) {
            throw new AppError(httpStatus.BAD_REQUEST, "You can only review books you have purchased");
        }
        //need to check if user has already reviewed this book
        const existingReview = await Review.findOne({ user, book });
        if (existingReview) {
            throw new AppError(httpStatus.BAD_REQUEST, "You have already reviewed this book");
        }
        const re = await Review.create({ user, book, rating, comment, order: hasPurchased._id });

        return sendResponse(res, {
            statusCode: httpStatus.CREATED,
            success: true,
            message: "Review created successfully",
            data: re,
        });
    }
    if(!shop || !order){
        throw new AppError(httpStatus.BAD_REQUEST, "Shop and order must be provided");
    }
    // Check if user has completed an order with the shop
    const hasOrdered = await OrderModel.exists({
        customer: user,
        vendor: shop,
        status: { $in: ["delivered", "completed"] },
    });
    if (!hasOrdered) {
        throw new AppError(httpStatus.BAD_REQUEST, "You can only review shops you have ordered from");
    }
    //need to check if user has already reviewed this shop
    const existingShopReview = await Review.findOne({ user, shop });
    if (existingShopReview) {
        throw new AppError(httpStatus.BAD_REQUEST, "You have already reviewed this shop");
    }
    await Review.create({ user, shop, rating, comment, order: hasOrdered._id });
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Review created successfully",
    });
});


