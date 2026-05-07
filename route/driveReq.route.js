import express from "express";
import { createDriverRequest, deleteDriverRequest, getAllDriverRequests, getShopDriverRequests, getSingleDriverRequest, updateDriverRequest, assignDriverToRequest, updateDriverRequestStatus, getDriverRequestsByDriver } from "../controller/driverReq.controller.js";


const router = express.Router();

router.post("/driver-request", createDriverRequest);

router.get("/driver-requests", getAllDriverRequests); 
// admin can do:
// /driver-requests?shopId=xxxxx

router.get("/driver-requests/shop/:shopId", getShopDriverRequests);

router.get("/driver-requests/:id", getSingleDriverRequest);

router.patch("/driver-requests/:id", updateDriverRequest);

router.delete("/driver-requests/:id", deleteDriverRequest);

router.get("/driver-requests/driver/:driverId", getDriverRequestsByDriver);

router.patch ("/driver-requests/:id/assign-driver", assignDriverToRequest);

router.patch("/driver-requests/:id/update-status", updateDriverRequestStatus);

export default router;
