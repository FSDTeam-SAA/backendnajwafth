import httpStatus from "http-status";
import { Book } from "../model/book.model.js";
import { DriverRequest } from "../model/driveReq.model.js";
import { Order } from "../model/order.model.js";
import { Shop } from "../model/shop.model.js";
import { User } from "../model/user.model.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";

const buildMonthlyDeliveryActivity = (orders = []) => {
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const counts = new Array(12).fill(0);

  for (const order of orders) {
    const monthIndex = new Date(order.createdAt).getMonth();
    counts[monthIndex] += 1;
  }

  return labels.map((label, index) => ({
    label,
    value: counts[index],
  }));
};

const buildWeeklyRevenue = (orders = []) => {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const revenueMap = new Map(labels.map((label) => [label, 0]));

  for (const order of orders) {
    const date = new Date(order.createdAt);
    const label = labels[(date.getDay() + 6) % 7];
    revenueMap.set(label, (revenueMap.get(label) || 0) + (order.totalAmount || 0));
  }

  return labels.map((label) => ({
    label,
    value: Number((revenueMap.get(label) || 0).toFixed(2)),
  }));
};

const buildTopSellingBooks = (orders = []) => {
  const bookMap = new Map();

  for (const order of orders) {
    for (const item of order.items || []) {
      const product = item.product;
      const productId = product?._id?.toString?.() || product?.toString?.();
      if (!productId) continue;

      const current = bookMap.get(productId) || {
        _id: productId,
        title: product?.title,
        author: product?.author,
        price: product?.price,
        coverImage: product?.coverImage,
        category: product?.category,
        soldCount: 0,
      };

      current.soldCount += item.quantity || 0;
      bookMap.set(productId, current);
    }
  }

  return Array.from(bookMap.values())
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, 10);
};

export const getSellerOverview = catchAsync(async (req, res) => {
  const sellerId = req.user._id;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [bookCount, allSellerOrders, completedOrders, recentOrders] = await Promise.all([
    Book.countDocuments({ shopId: sellerId }),
    Order.find({ vendor: sellerId })
      .populate("customer", "name email phone avatar")
      .populate("items.product", "title author price coverImage category")
      .sort({ createdAt: -1 }),
    Order.find({ vendor: sellerId, status: "delivered" }),
    Order.find({ vendor: sellerId })
      .populate("customer", "name email phone avatar")
      .populate("items.product", "title author price coverImage category")
      .sort({ createdAt: -1 })
      .limit(8),
  ]);

  const totalRevenue = completedOrders.reduce(
    (sum, order) => sum + (order.totalAmount || 0),
    0,
  );
  const ordersToday = allSellerOrders.filter(
    (order) => new Date(order.createdAt) >= startOfToday,
  ).length;
  const totalCustomers = new Set(
    allSellerOrders.map((order) => order.customer?._id?.toString()).filter(Boolean),
  ).size;
  const topBooks = buildTopSellingBooks(allSellerOrders);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Seller dashboard overview fetched successfully",
    data: {
      metrics: {
        totalBooks: bookCount,
        totalOrders: allSellerOrders.length,
        ordersToday,
        totalUsers: totalCustomers,
        totalCompletedOrders: completedOrders.length,
        totalRevenue: Number(totalRevenue.toFixed(2)),
      },
      salesAnalysis: buildWeeklyRevenue(allSellerOrders),
      recentOrders,
      topBooks,
    },
  });
});

export const getAdminOverview = catchAsync(async (_req, res) => {
  const [shops, drivers, driverRequests, completedOrders, recentOrders, recentDriverRequests] = await Promise.all([
    Shop.find().sort({ createdAt: -1 }).limit(8).populate("owner", "name email phone"),
    User.find({ role: "driver" }).sort({ createdAt: -1 }).limit(8).select("name email phone avatar createdAt"),
    DriverRequest.find()
      .populate("shopId", "name email phone")
      .populate("driver", "name email phone")
      .populate("orderId")
      .sort({ createdAt: -1 }),
    Order.find({ status: "delivered" }).sort({ createdAt: -1 }),
    Order.find()
      .populate("customer", "name email phone")
      .populate("vendor", "name email phone")
      .sort({ createdAt: -1 })
      .limit(8),
    DriverRequest.find()
      .populate("shopId", "name email phone")
      .populate("driver", "name email phone")
      .sort({ createdAt: -1 })
      .limit(8),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin dashboard overview fetched successfully",
    data: {
      metrics: {
        totalBookstores: shops.length,
        totalDrivers: drivers.length,
        totalDriverRequests: driverRequests.length,
        totalCompleted: completedOrders.length,
      },
      deliveryActivity: buildMonthlyDeliveryActivity(completedOrders),
      recentOrders,
      recentDriverRequests,
      recentShops: shops,
      recentDrivers: drivers,
    },
  });
});
