import mongoose, { Schema, Types } from "mongoose";

const driverReqSchema = new Schema(
  {
    shopId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    shopName:{
        type: String,
    },
    phone:{
        type: String,
    },
    orderDate:{
        type: Date,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    customerName:{
        type: String,
    },
    item:{
        type: String,
    },
    location:{
        type: String,
    },
    orderId:{
        type: Schema.Types.ObjectId,
        ref: "Order",
    },
    price:{
        type: Number,
    },
    message:{
        type: String,
    },
    driver:{
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    status:{
        type: String,
        enum: ["pending", "accepted", "rejected"],
        default: "pending",
    }
  },
  { timestamps: true }
);

export const DriverRequest = mongoose.model("DriverRequest", driverReqSchema);
