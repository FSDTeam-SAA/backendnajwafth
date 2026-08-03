import { DriverRequest } from "../model/driveReq.model.js";
import { Shop } from "../model/shop.model.js";
import { User } from "../model/user.model.js";

const formatAddress = (order) => {
  if (typeof order.address === "string" && order.address.trim()) {
    return order.address.trim();
  }

  const details = order.addressDetails || {};
  return [
    details.line1,
    details.line2,
    details.city,
    details.postalCode,
    details.state,
    details.country,
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => part.trim())
    .join(", ");
};

const getItemSummary = (items = []) => {
  const itemCount = items.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0,
  );
  return `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
};

const getOfferStatus = (order) => {
  if (order.status === "delivered") return "completed";
  if (order.driver) return "accepted";
  return "pending";
};

export const ensureDriverRequestForOrder = async (order) => {
  if (!order?._id || !order.vendor) return null;

  const [vendor, customer, shop] = await Promise.all([
    User.findById(order.vendor).select("name username phone address").lean(),
    User.findById(order.customer).select("name username phone").lean(),
    Shop.findOne({ owner: order.vendor }).select("name address").lean(),
  ]);

  const customerLocation = formatAddress(order);
  const shopName = shop?.name || vendor?.name || vendor?.username || "Books store";
  const shopPhone = vendor?.phone || "";
  const customerPhone = order.phone || customer?.phone || "";
  const status = getOfferStatus(order);
  const now = new Date();

  const offer = {
    shopId: order.vendor,
    shopName,
    shopPhone,
    customerPhone,
    phone: shopPhone || customerPhone,
    shopLocation: shop?.address || vendor?.address || "",
    customerLocation,
    location: customerLocation,
    orderDate: order.createdAt || now,
    totalAmount: order.totalAmount || 0,
    customerName:
      order.recipientName || customer?.name || customer?.username || "Customer",
    item: getItemSummary(order.items),
    orderId: order._id,
    price: order.shippingFee || 0,
    status,
    ...(order.driver
      ? {
          driver: order.driver,
          assignedAt: order.updatedAt || now,
          acceptedAt: order.updatedAt || now,
        }
      : {}),
  };

  return DriverRequest.findOneAndUpdate(
    { orderId: order._id },
    { $setOnInsert: offer },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
};
