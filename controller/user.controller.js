import httpStatus from "http-status";
import { User } from "../model/user.model.js";
import { Order } from "../model/order.model.js";
import { DriverRequest } from "../model/driveReq.model.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Book } from "../model/book.model.js";
import { Review } from "../model/review.model.js";
import { Notification } from "../model/notification.model.js";

// Get user profile
export const getProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -refreshToken -verificationInfo -password_reset_token",
  );
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile fetched successfully",
    data: user,
  });
});

// Update profile
export const updateProfile = catchAsync(async (req, res) => {
  const {
    name,
    email,
    phone,
    bio,
    gender,
    dob,
    age,
    address,
    driverId,
    entrepreneurStatus,
    vehicleType,
    vehiclePlateNumber,
  } = req.body;

  const userId = req.user._id;

  // Find user
  const user = await User.findById(userId).select(
    "-password -refreshToken -verificationInfo -password_reset_token",
  );
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  // Update only provided fields
  if (name !== undefined) user.name = name;
  if (email !== undefined && email !== user.email) {
    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      throw new AppError(httpStatus.BAD_REQUEST, "Email already in use");
    }
    user.email = email;
  }
  if (phone !== undefined) user.phone = phone;
  if (driverId !== undefined) user.driverId = driverId;
  if (entrepreneurStatus !== undefined) {
    user.entrepreneurStatus = entrepreneurStatus;
  }
  if (vehicleType !== undefined) user.vehicleType = vehicleType;
  if (vehiclePlateNumber !== undefined) {
    user.vehiclePlateNumber = vehiclePlateNumber;
  }
  if (bio !== undefined) user.bio = bio;
  if (gender !== undefined && gender !== "") {
    user.gender = String(gender).toLowerCase();
  }
  if (dob !== undefined && dob !== "") {
    const parsedDob = new Date(dob);
    if (Number.isNaN(parsedDob.getTime())) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid date of birth");
    }
    user.dob = parsedDob;
  }
  if (age !== undefined && age !== "") {
    const parsedAge = Number(age);
    if (!Number.isInteger(parsedAge) || parsedAge < 0) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Age must be a non-negative whole number",
      );
    }
    user.age = parsedAge;
  }
  if (address !== undefined) user.address = address;

  if (req.file) {
    const result = await uploadOnCloudinary(req.file.buffer);
    if (!user.avatar) {
      user.avatar = { public_id: "", url: "" };
    }
    user.avatar.public_id = result.public_id;
    user.avatar.url = result.secure_url;
  }

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully",
    data: user,
  });
});

// Change user password
export const changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (newPassword !== confirmPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "New password and confirm password do not match",
    );
  }

  if (!(await User.isPasswordMatched(currentPassword, user.password))) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      "Current password is incorrect",
    );
  }

  user.password = newPassword;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully",
    data: user,
  });
});

// List unique customers who have ordered from this seller
export const getSellerCustomers = catchAsync(async (req, res) => {
  const sellerId = req.user._id;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;

  const orders = await Order.find({ vendor: sellerId })
    .populate("customer", "name email phone avatar")
    .sort({ createdAt: -1 });

  const map = new Map();
  for (const order of orders) {
    const customer = order.customer;
    if (!customer || !customer._id) continue;
    const key = customer._id.toString();
    const existing = map.get(key);
    const orderBookCount = Array.isArray(order.items)
      ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
      : 0;

    if (existing) {
      existing.totalOrders += 1;
      existing.totalBooks += orderBookCount;
      existing.totalSpent += order.totalAmount || 0;
      if (new Date(order.createdAt) > new Date(existing.lastOrderAt)) {
        existing.orderId = order.orderId;
        existing.lastOrderAt = order.createdAt;
        existing.status = order.status;
      }
    } else {
      map.set(key, {
        _id: key,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        avatar: customer.avatar,
        orderId: order.orderId,
        lastOrderAt: order.createdAt,
        createdAt: order.createdAt,
        totalOrders: 1,
        totalBooks: orderBookCount,
        totalSpent: order.totalAmount || 0,
        status: order.status,
      });
    }
  }

  const all = Array.from(map.values());
  const total = all.length;
  const totalPage = Math.max(1, Math.ceil(total / limit));
  const skip = (page - 1) * limit;
  const users = all.slice(skip, skip + limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Seller customers fetched successfully",
    data: {
      users,
      meta: {
        page,
        limit,
        total,
        totalPage,
      },
    },
  });
});

export const getAdminDrivers = catchAsync(async (_req, res) => {
  const drivers = await User.find({ role: "driver" })
    .select("-password -refreshToken -verificationInfo -password_reset_token")
    .sort({ createdAt: -1 });

  const driverIds = drivers.map((driver) => driver._id);

  const [activeAssignments, completedDeliveries] = await Promise.all([
    DriverRequest.aggregate([
      {
        $match: {
          driver: { $in: driverIds },
          status: { $in: ["pending", "accepted"] },
        },
      },
      {
        $group: {
          _id: "$driver",
          count: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          driver: { $in: driverIds },
          status: "delivered",
        },
      },
      {
        $group: {
          _id: "$driver",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const activeMap = new Map(
    activeAssignments.map((entry) => [entry._id.toString(), entry.count]),
  );
  const completedMap = new Map(
    completedDeliveries.map((entry) => [entry._id.toString(), entry.count]),
  );

  const data = drivers.map((driver) => {
    const key = driver._id.toString();
    const currentOrders = activeMap.get(key) || 0;

    return {
      ...driver.toObject(),
      status: currentOrders > 0 ? "busy" : "available",
      currentOrders,
      completedDeliveries: completedMap.get(key) || 0,
    };
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Drivers fetched successfully",
    data,
  });
});

export const deleteOwnAccount = catchAsync(async (req, res) => {
  const userId = req.user._id;

  await Promise.all([
    DriverRequest.updateMany(
      { driver: userId, status: "accepted" },
      { $unset: { driver: 1 }, $set: { status: "pending" } },
    ),
    DriverRequest.updateMany(
      { driver: userId, status: { $ne: "accepted" } },
      { $unset: { driver: 1 } },
    ),
    DriverRequest.updateMany(
      { dismissedDrivers: userId },
      { $pull: { dismissedDrivers: userId } },
    ),
    Order.updateMany({ driver: userId }, { $unset: { driver: 1 } }),
    Notification.deleteMany({
      $or: [{ user: userId }, { actor: userId }],
    }),
  ]);

  const user = await User.findByIdAndDelete(userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Account and personal profile data deleted successfully",
    data: null,
  });
});


export const achievement = catchAsync(async (req, res) => {
  const books =await Book.countDocuments();
  const users =await User.countDocuments({role:"buyer"});
  const reviews =await Review.countDocuments();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Achievement fetched successfully",
    data: {
      totalBooks: books,
      totalUsers: users,
      totalReviews: reviews,
    }});

})
