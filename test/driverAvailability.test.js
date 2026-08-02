import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { getDriverAvailability } from "../utils/driverAvailability.js";
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

test("new drivers are offline by default", () => {
  const driver = new User({ role: "driver" });
  assert.equal(driver.isOnline, false);
});

test("completed is a valid driver request status", () => {
  const request = new DriverRequest({
    shopId: new mongoose.Types.ObjectId(),
    status: "completed",
  });
  assert.equal(request.validateSync(), undefined);
});
