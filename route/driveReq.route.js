import express from "express";
import { createDriverRequest, deleteDriverRequest, getAllDriverRequests, getShopDriverRequests, getSingleDriverRequest, updateDriverRequest } from "../controller/driverReq.controller.js";


const router = express.Router();

router.post("/driver-request", createDriverRequest);

router.get("/driver-requests", getAllDriverRequests); 
// admin can do:
// /driver-requests?shopId=xxxxx

router.get("/driver-requests/shop/:shopId", getShopDriverRequests);

router.get("/driver-requests/:id", getSingleDriverRequest);

router.patch("/driver-requests/:id", updateDriverRequest);

router.delete("/driver-requests/:id", deleteDriverRequest);

export default router;
