import "dotenv/config";
import mongoose from "mongoose";
import { DriverRequest } from "../model/driveReq.model.js";
import { Order } from "../model/order.model.js";
import { ensureDriverRequestForOrder } from "../utils/driverRequestOffer.js";

const shouldApply = process.argv.includes("--apply");

const run = async () => {
  if (!process.env.MONGO_DB_URL) {
    throw new Error("MONGO_DB_URL is required");
  }

  await mongoose.connect(process.env.MONGO_DB_URL);

  const linkedOrderIds = await DriverRequest.distinct("orderId");
  const orders = await Order.find({ _id: { $nin: linkedOrderIds } }).sort({ createdAt: 1 });

  console.log(`Found ${orders.length} orders without driver offers.`);
  if (!shouldApply) {
    console.log("Dry run only. Re-run with --apply to create the missing offers.");
    return;
  }

  let created = 0;
  for (const order of orders) {
    await ensureDriverRequestForOrder(order);
    created += 1;
  }

  console.log(`Created ${created} missing driver offers.`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
