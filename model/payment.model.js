import mongoose from "mongoose";

const paymentInfoSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      ref: "User",
    },
    orderId: {
      type: mongoose.Types.ObjectId,
      ref: "Order",
    },
    subscriptionId: {
      type: mongoose.Types.ObjectId,
      ref: "Subscription",
    },
    price: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: ["complete", "pending", "failed"],
      default: "pending",
    },
    seasonId: { type: String },
    transactionId: { type: String },
    paymentMethodNonce: { type: String },
    paymentMethod: { type: String },
    type: {
      type: String,
      enum: ["donation", "order", "subscription"],
      required: true,
    },
    billingPeriod: {
      type: String,
      enum: ["monthly", "yearly"],
    },
    adminCommission: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const paymentInfo = mongoose.model("paymentInfo", paymentInfoSchema);
