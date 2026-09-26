import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import { login } from "../controller/auth.controller.js";
import { deleteOwnAccount } from "../controller/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { User } from "../model/user.model.js";

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

test("account deletion retains the user and revokes session data", async () => {
  const original = User.findOneAndUpdate;
  let capturedFilter;
  let capturedUpdate;
  User.findOneAndUpdate = async (filter, update) => {
    capturedFilter = filter;
    capturedUpdate = update;
    return { _id: filter._id };
  };

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

    assert.deepEqual(capturedFilter, { _id: userId, deletedAt: null });
    assert.ok(capturedUpdate.$set.deletedAt instanceof Date);
    assert.equal(capturedUpdate.$set.refreshToken, "");
    assert.deepEqual(capturedUpdate.$set.fcmTokens, []);
    assert.equal(clearedCookie, "refreshToken");
    assert.equal(payload.success, true);
  } finally {
    User.findOneAndUpdate = original;
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
