import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";

const otpSchema = new Schema(
  {
    hash: {
      type: String,
      default: "",
      select: false,
    },
    expiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    attempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lastSentAt: {
      type: Date,
      default: null,
      select: false,
    },
    purpose: {
      type: String,
      enum: ["RESET_PASSWORD", ""],
      default: "",
      select: false,
    },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    fullName: {
      type: String,
      trim: true,
      required: [true, "Full name is required"],
      maxlength: [100, "Full name cannot exceed 100 characters"],
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: [true, "Email is required"],
      index: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },

    phone: {
      type: String,
      trim: true,
      required: [true, "Phone number is required"],
      maxlength: [20, "Phone number cannot exceed 20 characters"],
    },

    role: {
      type: String,
      enum: ["buyer", "driver", "admin"],
      default: "buyer",
      required: true,
    },

    authProvider: {
      type: String,
      enum: ["LOCAL", "GOOGLE"],
      default: "LOCAL",
    },

    googleId: {
      type: String,
      default: null,
      index: true,
    },

    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      required: function () {
        return this.authProvider === "LOCAL";
      },
      select: false,
    },

    isEmailVerified: {
      type: Boolean,
      default: true,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    refreshTokenHash: {
      type: String,
      default: "",
      select: false,
    },

    avatar: {
      public_id: {
        type: String,
        default: "",
      },
      url: {
        type: String,
        default: "",
      },
    },

    otp: {
      type: otpSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  if (!this.password) return next();

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
  this.password = await bcrypt.hash(this.password, saltRounds);
  next();
});

userSchema.methods.isPasswordMatched = async function (enteredPassword) {
  if (!this.password) return false;
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.isOtpValid = async function (enteredOtp) {
  if (!this.otp?.hash || !this.otp?.expiresAt) return false;
  if (this.otp.expiresAt < new Date()) return false;
  return bcrypt.compare(String(enteredOtp), this.otp.hash);
};

userSchema.methods.setRefreshToken = async function (token) {
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
  this.refreshTokenHash = await bcrypt.hash(token, saltRounds);
};

userSchema.methods.isRefreshTokenValid = async function (token) {
  if (!this.refreshTokenHash) return false;
  return bcrypt.compare(token, this.refreshTokenHash);
};

userSchema.methods.clearRefreshToken = async function () {
  this.refreshTokenHash = "";
};

export const User = mongoose.model("User", userSchema);