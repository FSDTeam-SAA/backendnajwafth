import { DriverRequest } from "../model/driveReq.model.js";
import { Order } from "../model/order.model.js";

export const reconcileDeliveredDriverRequests = async (filter = {}) => {
  const acceptedRequests = await DriverRequest.find({
    ...filter,
    status: "accepted",
  })
    .select("_id orderId")
    .lean();

  if (!acceptedRequests.length) return 0;

  const deliveredOrderIds = await Order.distinct("_id", {
    _id: { $in: acceptedRequests.map((request) => request.orderId) },
    status: "delivered",
  });

  if (!deliveredOrderIds.length) return 0;

  const result = await DriverRequest.updateMany(
    {
      _id: { $in: acceptedRequests.map((request) => request._id) },
      orderId: { $in: deliveredOrderIds },
      status: "accepted",
    },
    { $set: { status: "completed" } },
  );

  return result.modifiedCount;
};
