import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  activeDriverRequestStatuses,
  getDriverAvailability,
  getDriverOnlineStatus,
  getDriverRideStatus,
  isDriverRequestActive,
} from "../utils/driverAvailability.js";
import { User } from "../model/user.model.js";
import { DriverRequest } from "../model/driveReq.model.js";

test("driver availability prioritizes the explicit offline state", () => {
  assert.equal(
    getDriverAvailability({ isOnline: false, currentOrders: 1 }),
    "offline",
  );
  assert.equal(
    getDriverAvailability({ isOnline: true, currentOrders: 0 }),
    "available",
  );
  assert.equal(
    getDriverAvailability({ isOnline: true, currentOrders: 1 }),
    "busy",
  );
});

test("ride and online statuses are reported independently", () => {
  assert.equal(getDriverRideStatus({ currentOrders: 0 }), "available");
  assert.equal(getDriverRideStatus({ currentOrders: 1 }), "busy");
  assert.equal(getDriverOnlineStatus({ isOnline: true }), "online");
  assert.equal(getDriverOnlineStatus({ isOnline: false }), "offline");
});

test("only accepted requests make a driver busy", () => {
  assert.deepEqual(activeDriverRequestStatuses, ["accepted"]);
  assert.equal(isDriverRequestActive("pending"), false);
  assert.equal(isDriverRequestActive("accepted"), true);
  assert.equal(isDriverRequestActive("completed"), false);
});

test("new drivers are offline by default", () => {
  const driver = new User({ role: "driver" });
  assert.equal(driver.isOnline, false);
});

test("completed is a valid driver request status", () => {
  const request = new DriverRequest({
    shopId: new mongoose.Types.ObjectId(),
    orderId: new mongoose.Types.ObjectId(),
    status: "completed",
  });
  assert.equal(request.validateSync(), undefined);
});
