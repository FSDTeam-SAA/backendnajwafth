import express from "express";

import authRoute from "../route/auth.route.js";
import userRoute from "../route/user.route.js";
import driverReqRoute from "../route/driveReq.route.js";
import bookRoute from "../route/book.route.js";
import cartRoute from "../route/cart.route.js";
import couponRoute from "../route/coupon.route.js";
import notificationRoute from "../route/notification.route.js";
import orderRoute from "../route/order.route.js";
import categoryRoute from "../route/product.category.route.js";
import shopRoute from "../route/shop.route.js";
import wishlistRoute from "../route/wishlist.route.js";

const router = express.Router();

router.use("/auth", authRoute);
router.use("/user", userRoute);
router.use("/driver-request", driverReqRoute);
router.use("/books", bookRoute);
router.use("/cart", cartRoute);
router.use("/coupon", couponRoute);
router.use("/notification", notificationRoute);
router.use("/order", orderRoute);
router.use("/category", categoryRoute);
router.use("/shop", shopRoute);
router.use("/wishlist", wishlistRoute);

export default router;
