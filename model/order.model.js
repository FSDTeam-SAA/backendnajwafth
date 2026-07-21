import mongoose, { Schema } from "mongoose";

const orderItemSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: "Book",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
  },
  price: {
    type: Number,
    required: true,
  },
});

const orderSchema = new Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    items: [orderItemSchema],
    totalAmount: {
      type: Number,
      required: true,
    },
    shippingFee: {
      type: Number,
      default: 5,
    },
    discount: {
      type: Number,
      default: 0,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "pending", "complete", "failed"],
      default: "pending",
    },
    adminCommissionRate: {
      type: Number,
      default: 15,
    },
    adminCommission: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "picked", "delivered"],
      default: "pending",
    },
    trackingNumber: {
      type: String,
      default: "",
    },
    expectedDeliveryDate: {
      type: Date,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vendor: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    address: {
      type: String,
    },
    // Recipient contact + structured delivery address captured at checkout.
    recipientName: {
      type: String,
    },
    phone: {
      type: String,
    },
    addressDetails: {
      line1: { type: String },
      line2: { type: String },
      city: { type: String },
      postalCode: { type: String },
      state: { type: String },
      country: { type: String },
    },
    coupon: {
      type: Schema.Types.ObjectId,
      ref: "Coupon",
    },
    driver:{
      type: Schema.Types.ObjectId,
      ref: "User",
    }
  },
  { timestamps: true },
);

export const Order = mongoose.model("Order", orderSchema);
