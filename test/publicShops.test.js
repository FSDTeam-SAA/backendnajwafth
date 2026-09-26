import test from "node:test";
import assert from "node:assert/strict";
import { getPublicShops } from "../controller/publicShop.controller.js";
import { getAllBooks } from "../controller/book.controller.js";
import { Shop } from "../model/shop.model.js";
import { Book } from "../model/book.model.js";
import shopRouter from "../route/shop.route.js";
import { protect } from "../middleware/auth.middleware.js";

const ownerId = "111111111111111111111111";
function invoke(handler, query = {}) {
  return new Promise((resolve, reject) => handler({ query }, {
    status() { return this; }, json: resolve,
  }, reject));
}

test("public route precedes authentication; admin routes remain protected", () => {
  const publicIndex = shopRouter.stack.findIndex((layer) => layer.route?.path === "/public");
  const authIndex = shopRouter.stack.findIndex((layer) => layer.handle === protect);
  const adminIndex = shopRouter.stack.findIndex((layer) => layer.route?.path === "/");
  assert.ok(publicIndex >= 0 && publicIndex < authIndex && authIndex < adminIndex);
});

test("guest directory paginates seller shops regardless of approval status", async (t) => {
  let pipeline;
  t.mock.method(Shop, "aggregate", async (value) => {
    pipeline = value;
    return [{
      metadata: [{ total: 5 }],
      data: [{
        id: ownerId,
        name: "Real bookstore",
        logo: null,
        banner: ["https://example.com/banner.jpg"],
        description: "",
        address: "Public storefront",
        bookCount: 12,
      }],
    }];
  });
  const result = await invoke(getPublicShops, { page: "2", limit: "2" });
  assert.equal(result.success, true);
  assert.equal(pipeline[0].$lookup.from, "users");
  assert.deepEqual(pipeline[2], { $match: {
    "owner.role": "seller", "owner.deletedAt": null,
    "owner.verificationInfo.verified": true,
  } });
  assert.equal(
    pipeline.some((stage) => stage.$match?.shopStatus !== undefined),
    false,
  );
  const facet = pipeline.find((stage) => stage.$facet).$facet;
  assert.deepEqual(facet.data.slice(0, 2), [{ $skip: 2 }, { $limit: 2 }]);
  assert.equal(facet.data[2].$lookup.from, Book.collection.name);
  const publicFields = facet.data[3].$project;
  assert.deepEqual(publicFields.logo, { $literal: null });
  assert.deepEqual(Object.keys(publicFields).sort(), [
    "_id", "address", "banner", "bookCount", "description", "id", "logo", "name",
  ]);
  assert.deepEqual(result.pagination, {
    page: 2, limit: 2, total: 5, totalPages: 3, hasNextPage: true,
  });
  assert.deepEqual(result.data, [{ id: ownerId, name: "Real bookstore",
    logo: null, banner: ["https://example.com/banner.jpg"], description: "",
    address: "Public storefront", bookCount: 12 }]);
});

test("directory returns a consistent empty response", async (t) => {
  t.mock.method(Shop, "aggregate", async () => [{ metadata: [], data: [] }]);
  const result = await invoke(getPublicShops);
  assert.deepEqual(result.data, []);
  assert.deepEqual(result.pagination, {
    page: 1, limit: 12, total: 0, totalPages: 0, hasNextPage: false,
  });
});

test("invalid public pagination returns 400", async () => {
  for (const query of [{ page: "0" }, { page: "1.5" }, { limit: "51" }, { limit: "bad" }]) {
    await assert.rejects(invoke(getPublicShops, query), { statusCode: 400 });
  }
});

test("existing public book catalog filters both query and count by seller ID", async (t) => {
  const filters = [];
  t.mock.method(Book, "find", (filter) => {
    filters.push(filter);
    return { populate() { return this; }, sort() { return this; },
      skip(value) { assert.equal(value, 20); return this; },
      async limit(value) { assert.equal(value, 20); return []; } };
  });
  t.mock.method(Book, "countDocuments", async (filter) => { filters.push(filter); return 0; });
  const result = await invoke(getAllBooks, { shopId: ownerId, page: "2", limit: "20" });
  assert.equal(result.success, true);
  assert.deepEqual(result.data.books, []);
  assert.deepEqual(filters, [{ shopId: ownerId }, { shopId: ownerId }]);
});

test("public book catalog rejects an invalid seller ID", async () => {
  await assert.rejects(
    invoke(getAllBooks, { shopId: "not-an-object-id" }),
    (error) => error.statusCode === 400 && error.message === "Invalid bookstore ID",
  );
});
