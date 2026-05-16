import httpStatus from "http-status";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import AppError from "../errors/AppError.js";
import sendResponse from "../utils/sendResponse.js";
import catchAsync from "../utils/catchAsync.js";
import { Order } from "../model/order.model.js";
import { Shop } from "../model/shop.model.js";
import { User } from "../model/user.model.js";

const applyShopUpdates = async (shop, req) => {
  const { name, description, address, deliveryArea } = req.body;

  if (name) shop.name = name;
  if (description) shop.description = description;
  if (address) shop.address = address;
  if (deliveryArea !== undefined) shop.deliveryArea = deliveryArea;

  const banner = {};
  const certificate = {};

  if (req.files?.banner?.length > 0) {
    const upload = await Promise.all(
      req.files.banner.map(async (file) => {
        const { public_id, secure_url, url } = await uploadOnCloudinary(
          file.buffer,
        );

        return {
          public_id,
          url: secure_url || url,
        };
      }),
    );

    shop.banner = upload;
  }

  if (req.files?.certificate?.[0]) {
    const { public_id, secure_url, url } = await uploadOnCloudinary(
      req.files.certificate[0].buffer,
    );
    certificate.public_id = public_id;
    certificate.url = secure_url || url;
  }

  if (Object.keys(banner).length > 0) shop.banner = banner;
  if (Object.keys(certificate).length > 0) shop.certificate = certificate;
};

export const getShops = catchAsync(async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const skip = (page - 1) * limit;
  const sellerQuery = { role: "seller" };

  if (req.query.search) {
    sellerQuery.$or = [
      { name: { $regex: req.query.search, $options: "i" } },
      { email: { $regex: req.query.search, $options: "i" } },
      { phone: { $regex: req.query.search, $options: "i" } },
      { username: { $regex: req.query.search, $options: "i" } },
    ];
  }

  const sellers = await User.find(sellerQuery)
    .select("name email phone avatar address username createdAt")
    .sort({ createdAt: -1 });

  const sellerIds = sellers.map((seller) => seller._id);
  const shopDocs = await Shop.find({ owner: { $in: sellerIds } }).populate(
    "owner",
    "name email phone avatar address username",
  );
  const orderCounts = await Order.aggregate([
    {
      $match: {
        vendor: { $in: sellerIds },
      },
    },
    {
      $group: {
        _id: "$vendor",
        totalOrders: { $sum: 1 },
      },
    },
  ]);

  const shopByOwner = new Map(
    shopDocs.map((shop) => [shop.owner?._id?.toString() || shop.owner?.toString(), shop]),
  );
  const orderCountBySeller = new Map(
    orderCounts.map((entry) => [entry._id?.toString(), entry.totalOrders]),
  );

  const mappedShops = sellers.map((seller) => {
    const shop = shopByOwner.get(seller._id.toString());

    return {
      _id: seller._id,
      shopId: shop?._id || null,
      name: shop?.name || seller.name || seller.username || "Books store",
      description: shop?.description || "",
      address: shop?.address || seller.address || "",
      deliveryArea: shop?.deliveryArea || "",
      shopStatus: shop?.shopStatus || "not verified",
      owner: {
        _id: seller._id,
        name: seller.name,
        email: seller.email,
        phone: seller.phone,
        avatar: seller.avatar,
        address: seller.address,
        username: seller.username,
      },
      banner: shop?.banner || [],
      certificate: shop?.certificate || { public_id: "", url: "" },
      products: shop?.products || [],
      totalOrders: orderCountBySeller.get(seller._id.toString()) || 0,
      createdAt: seller.createdAt,
    };
  });

  const filteredShops = req.query.status
    ? mappedShops.filter((shop) => shop.shopStatus === req.query.status)
    : mappedShops;

  const paginatedShops = filteredShops.slice(skip, skip + limit);
  const total = filteredShops.length;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shops fetched",
    data: {
      shops: paginatedShops,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

export const getShopById = catchAsync(async (req, res) => {
  let shop = await Shop.findById(req.params.id)
    .populate("products", "title price photos rating reviewsCount verified thumbnail")
    .populate("owner", "name email phone avatar address username");
  let sellerId = shop?.owner?._id?.toString() || shop?.owner?.toString() || null;

  if (!shop) {
    shop = await Shop.findOne({ owner: req.params.id })
      .populate("products", "title price photos rating reviewsCount verified thumbnail")
      .populate("owner", "name email phone avatar address username");
    sellerId = shop?.owner?._id?.toString() || shop?.owner?.toString() || null;
  }

  if (!shop) {
    const seller = await User.findOne({ _id: req.params.id, role: "seller" }).select(
      "name email phone avatar address username",
    );

    if (!seller) throw new AppError(httpStatus.NOT_FOUND, "Shop not found");
    const totalOrders = await Order.countDocuments({ vendor: seller._id });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Shop fetched",
      data: {
        _id: seller._id,
        name: seller.name || seller.username || "Books store",
        address: seller.address || "",
        shopStatus: "not verified",
        owner: {
          _id: seller._id,
          name: seller.name,
          email: seller.email,
          phone: seller.phone,
          avatar: seller.avatar,
          address: seller.address,
          username: seller.username,
        },
        products: [],
        totalOrders,
      },
    });
  }

  const totalOrders = await Order.countDocuments({ vendor: sellerId });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shop fetched",
    data: {
      ...shop.toObject(),
      totalOrders,
    },
  });
});

export const updateShop = catchAsync(async (req, res) => {
  const shopId = req.params.id;

  const shop = await Shop.findById(shopId);
  if (!shop) throw new AppError(httpStatus.NOT_FOUND, "Shop not found");

  if (
    req.user.role === "seller" &&
    shop.owner.toString() !== req.user._id.toString()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot update other vendor's shop",
    );
  }
  await applyShopUpdates(shop, req);

  await shop.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shop updated",
    data: shop,
  });
});

export const getMyShop = catchAsync(async (req, res) => {
  const shopId = req.user.shopId;

  const shop = shopId
    ? await Shop.findById(shopId).populate(
        "products",
        "title price photos rating reviewsCount verified thumbnail",
      )
    : await Shop.findOne({ owner: req.user._id }).populate(
        "products",
        "title price photos rating reviewsCount verified thumbnail",
      );

  if (!shop) throw new AppError(httpStatus.NOT_FOUND, "Shop not found");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "My shop fetched",
    data: shop,
  });
});

export const updateMyShop = catchAsync(async (req, res) => {
  const shopId = req.user.shopId;
  const shop = shopId
    ? await Shop.findById(shopId)
    : await Shop.findOne({ owner: req.user._id });

  if (!shop) throw new AppError(httpStatus.NOT_FOUND, "Shop not found");

  if (
    req.user.role === "seller" &&
    shop.owner.toString() !== req.user._id.toString()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Cannot update other vendor's shop",
    );
  }

  await applyShopUpdates(shop, req);
  await shop.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shop updated",
    data: shop,
  });
});

export const pendingShops = catchAsync(async (req, res) => {
  const shops = await Shop.find({ shopStatus: "not verified" }).populate(
    "owner",
    "name email phone avatar",
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Shops fetched",
    data: shops,
  });
});

export const updateShopStatus = catchAsync(async (req, res) => {
  const { shopId } = req.params;
  const { status } = req.body; // verified / not verified

  if (!["verified", "not verified"].includes(status)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid status value");
  }

  const shop = await Shop.findById(shopId);
  if (!shop) {
    throw new AppError(httpStatus.NOT_FOUND, "Shop not found");
  }

  shop.shopStatus = status;

  await shop.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Shop ${status} successfully`,
    data: {
      _id: shop._id,
      shopStatus: shop.shopStatus,
    },
  });
});
