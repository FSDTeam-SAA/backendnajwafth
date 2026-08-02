import "dotenv/config";
import mongoose from "mongoose";
import { DriverRequest } from "../model/driveReq.model.js";
import { Order } from "../model/order.model.js";

const run = async () => {
  if (!process.env.MONGO_DB_URL) {
    throw new Error("MONGO_DB_URL is required");
  }

  await mongoose.connect(process.env.MONGO_DB_URL);

  const deliveredOrderIds = await Order.distinct("_id", { status: "delivered" });
  const result = await DriverRequest.updateMany(
    { orderId: { $in: deliveredOrderIds }, status: "accepted" },
    { $set: { status: "completed" } },
  );

  console.log(`Completed ${result.modifiedCount} delivered driver requests.`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
