import { Schema, model } from "mongoose";

const adminSettingsSchema = new Schema(
  {
    key: {
      type: String,
      unique: true,
      required: true,
      default: "global",
    },
    adminCommissionRate: {
      type: Number,
      default: 15,
      min: [0, "Admin commission cannot be negative"],
      max: [100, "Admin commission cannot be greater than 100"],
    },
  },
  { timestamps: true },
);

export const AdminSettings = model("AdminSettings", adminSettingsSchema);
