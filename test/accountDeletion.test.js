import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import { login } from "../controller/auth.controller.js";
import { deleteOwnAccount } from "../controller/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { User } from "../model/user.model.js";
import { Order } from "../model/order.model.js";
import { DriverRequest } from "../model/driveReq.model.js";
import { Cart } from "../model/cart.model.js";
import { Wishlist } from "../model/wishlist.model.js";
import { Notification } from "../model/notification.model.js";
import { Review } from "../model/review.model.js";
import { paymentInfo } from "../model/payment.model.js";

function invoke(handler, req, res = {}) {
  return new Promise((resolve, reject) => {
    res.status ??= () => res;
    res.json ??= (payload) => resolve(payload);
    handler(req, res, (error) => (error ? reject(error) : resolve()));
  });
}

test("new users are active by default", () => {
  const user = new User({ email: "reader@example.com" });
  assert.equal(user.deletedAt, null);
});

test("account deletion removes personal data and anonymizes retained orders", async () => {
  const originals = {
    findOne: User.findOne,
    deleteUser: User.deleteOne,
    distinctOrders: Order.distinct,
    updateOrders: Order.updateMany,
    updateDriverRequests: DriverRequest.updateMany,
    deleteCarts: Cart.deleteMany,
    deleteWishlists: Wishlist.deleteMany,
    deleteReviews: Review.deleteMany,
    deleteNotifications: Notification.deleteMany,
    updateNotifications: Notification.updateMany,
    updatePayments: paymentInfo.updateMany,
  };
  const calls = [];
  User.findOne = async (filter) => {
    calls.push(["find-user", filter]);
    return { _id: filter._id, role: "buyer", avatar: {} };
  };
  User.deleteOne = async (filter) => calls.push(["delete-user", filter]);
  Order.distinct = async (_field, filter) => {
    calls.push(["find-orders", filter]);
    return [new mongoose.Types.ObjectId()];
  };
  Order.updateMany = async (filter, update) =>
    calls.push(["update-orders", filter, update]);
  DriverRequest.updateMany = async (filter, update) =>
    calls.push(["update-driver-requests", filter, update]);
  Cart.deleteMany = async (filter) => calls.push(["delete-carts", filter]);
  Wishlist.deleteMany = async (filter) =>
    calls.push(["delete-wishlists", filter]);
  Review.deleteMany = async (filter) => calls.push(["delete-reviews", filter]);
  Notification.deleteMany = async (filter) =>
    calls.push(["delete-notifications", filter]);
  Notification.updateMany = async (filter, update) =>
    calls.push(["update-notifications", filter, update]);
  paymentInfo.updateMany = async (filter, update) =>
    calls.push(["update-payments", filter, update]);

  let clearedCookie;
  const res = {
    clearCookie: (name) => {
      clearedCookie = name;
    },
    status() {
      return this;
    },
    json: (payload) => payload,
  };

  try {
    const userId = new mongoose.Types.ObjectId();
    const payload = await new Promise((resolve, reject) => {
      res.json = resolve;
      deleteOwnAccount(
        { user: { _id: userId, role: "buyer" } },
        res,
        reject,
      );
    });

    const orderCleanup = calls.find(([name]) => name === "update-orders");
    assert.deepEqual(orderCleanup[1], { customer: userId });
    assert.deepEqual(Object.keys(orderCleanup[2].$unset).sort(), [
      "address",
      "addressDetails",
      "customer",
      "phone",
      "recipientName",
    ]);
    assert.ok(calls.some(([name]) => name === "delete-carts"));
    assert.ok(calls.some(([name]) => name === "delete-wishlists"));
    assert.ok(calls.some(([name]) => name === "delete-reviews"));
    assert.ok(calls.some(([name]) => name === "update-payments"));
    assert.ok(calls.some(([name]) => name === "delete-user"));
    assert.equal(clearedCookie, "refreshToken");
    assert.equal(payload.success, true);
  } finally {
    User.findOne = originals.findOne;
    User.deleteOne = originals.deleteUser;
    Order.distinct = originals.distinctOrders;
    Order.updateMany = originals.updateOrders;
    DriverRequest.updateMany = originals.updateDriverRequests;
    Cart.deleteMany = originals.deleteCarts;
    Wishlist.deleteMany = originals.deleteWishlists;
    Review.deleteMany = originals.deleteReviews;
    Notification.deleteMany = originals.deleteNotifications;
    Notification.updateMany = originals.updateNotifications;
    paymentInfo.updateMany = originals.updatePayments;
  }
});

test("password login rejects a deleted account", async () => {
  const original = User.isUserExistsByEmail;
  User.isUserExistsByEmail = async () => ({ deletedAt: new Date() });
  try {
    await assert.rejects(
      invoke(login, { body: { email: "reader@example.com", password: "x" } }),
      (error) =>
        error.statusCode === 403 &&
        error.message === "This account has been deleted or deactivated.",
    );
  } finally {
    User.isUserExistsByEmail = original;
  }
});

test("protected routes reject existing access tokens after deletion", async () => {
  const original = User.findById;
  const originalSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "account-deletion-test-secret";
  User.findById = async () => ({ deletedAt: new Date() });
  const token = jwt.sign({ _id: "deleted-user" }, process.env.JWT_ACCESS_SECRET);

  try {
    await assert.rejects(
      invoke(protect, {
        headers: { authorization: `Bearer ${token}` },
      }),
      (error) =>
        error.statusCode === 403 &&
        error.message === "This account has been deleted or deactivated.",
    );
  } finally {
    User.findById = original;
    if (originalSecret == null) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = originalSecret;
    }
  }
});
