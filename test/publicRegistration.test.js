import test from "node:test";
import assert from "node:assert/strict";

import { resolvePublicRegistrationRole } from "../controller/auth.controller.js";

test("public registration defaults an omitted role to buyer", () => {
  assert.equal(resolvePublicRegistrationRole(), "buyer");
});

test("public registration keeps the intended seller role", () => {
  assert.equal(resolvePublicRegistrationRole("seller"), "seller");
});

for (const role of ["admin", "driver", "bookstore"]) {
  test(`public registration rejects the ${role} role`, async () => {
    await assert.rejects(
      async () => resolvePublicRegistrationRole(role),
      (error) => error.statusCode === 403 &&
        error.message === "Public registration is only available for buyer or seller accounts",
    );
  });
}
