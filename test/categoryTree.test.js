import test from "node:test";
import assert from "node:assert/strict";
import { getCategoryTree } from "../controller/category.controller.js";
import { Category } from "../model/category.model.js";
import { Book } from "../model/book.model.js";

function invoke(handler) {
  return new Promise((resolve, reject) =>
    handler(
      { query: {} },
      {
        status() {
          return this;
        },
        json: resolve,
      },
      reject,
    ),
  );
}

test("category tree only populates relationships defined by Book", async (t) => {
  const categoryId = "111111111111111111111111";
  const category = {
    _id: categoryId,
    name: "Fiction",
    image: {},
    level: 1,
    path: "Fiction",
  };
  const populatedPaths = [];

  t.mock.method(Category, "find", ({ parent }) => ({
    populate() {
      return this;
    },
    sort() {
      return Promise.resolve(parent === null ? [category] : []);
    },
  }));
  t.mock.method(Book, "countDocuments", async () => 1);
  t.mock.method(Book, "find", () => ({
    populate(path) {
      populatedPaths.push(path);
      return this;
    },
    then(resolve, reject) {
      return Promise.resolve([]).then(resolve, reject);
    },
  }));

  const result = await invoke(getCategoryTree);

  assert.equal(result.success, true);
  assert.equal(result.data[0].name, "Fiction");
  assert.deepEqual(populatedPaths, ["category", "shopId"]);
  assert.equal(Book.schema.path("vendor"), undefined);
});
