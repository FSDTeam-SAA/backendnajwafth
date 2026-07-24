import express from "express";
import { createDriverRequest, deleteDriverRequest, getAllDriverRequests, getShopDriverRequests, getSingleDriverRequest, updateDriverRequest, assignDriverToRequest, updateDriverRequestStatus, getDriverRequestsByDriver } from "../controller/driverReq.controller.js";
import { isSeller, protect } from "../middleware/auth.middleware.js";


const router = express.Router();

router.post("/driver-request", protect, isSeller, createDriverRequest);

router.get("/driver-requests", protect, getAllDriverRequests); 
// admin can do:
// /driver-requests?shopId=xxxxx

router.get("/driver-requests/shop/:shopId", protect, getShopDriverRequests);

router.get("/driver-requests/driver/:driverId", protect, getDriverRequestsByDriver);

router.get("/driver-requests/:id", protect, getSingleDriverRequest);

router.patch("/driver-requests/:id", protect, updateDriverRequest);

router.delete("/driver-requests/:id", protect, deleteDriverRequest);

router.patch ("/driver-requests/:id/assign-driver", protect, assignDriverToRequest);

router.patch("/driver-requests/:id/update-status", protect, updateDriverRequestStatus);

export default router;
