import test from "node:test";
import assert from "node:assert/strict";
import authRoute from "../route/auth.route.js";
import { User } from "../model/user.model.js";

test("driver registration is isolated from buyer and seller registration", async (t) => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const originalAccessSecret = process.env.JWT_ACCESS_SECRET;
  const originalRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const originalAccessExpiry = process.env.JWT_ACCESS_EXPIRES_IN;
  const originalRefreshExpiry = process.env.JWT_REFRESH_EXPIRES_IN;
  const createdRoles = [];

  User.findOne = async () => null;
  User.create = async (details) => {
    createdRoles.push(details.role);
    return {
      ...details,
      _id: "507f1f77bcf86cd799439011",
      toObject() {
        return { ...this };
      },
      async save() {},
    };
  };
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
  process.env.JWT_ACCESS_EXPIRES_IN = "1h";
  process.env.JWT_REFRESH_EXPIRES_IN = "1d";

  t.after(() => {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    for (const [key, value] of [
      ["JWT_ACCESS_SECRET", originalAccessSecret],
      ["JWT_REFRESH_SECRET", originalRefreshSecret],
      ["JWT_ACCESS_EXPIRES_IN", originalAccessExpiry],
      ["JWT_REFRESH_EXPIRES_IN", originalRefreshExpiry],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const details = {
    name: "Test Driver",
    email: "driver@example.com",
    phone: "123456789",
    password: "sample-password",
    confirmPassword: "sample-password",
  };
  const post = (path, body) => {
    const route = authRoute.stack.find((layer) => layer.route?.path === path);
    assert.ok(route, `Missing route: ${path}`);
    return new Promise((resolve) => {
      const response = {
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          resolve({ status: this.statusCode, body: payload });
        },
      };
      route.route.stack[0].handle({ body }, response, (error) => {
        resolve({ status: error.statusCode, error });
      });
    });
  };

  const driver = await post("/driver-register", details);
  assert.equal(driver.status, 200);
  assert.equal(driver.body.data.user.role, "driver");

  const blocked = await post("/register", { ...details, role: "driver" });
  assert.equal(blocked.status, 403);

  const buyer = await post("/register", { ...details, role: "buyer" });
  assert.equal(buyer.status, 200);
  assert.equal(buyer.body.data.user.role, "buyer");
  assert.deepEqual(createdRoles, ["driver", "buyer"]);
});
