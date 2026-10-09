import test from "node:test";
import assert from "node:assert/strict";

import AppError from "../errors/AppError.js";
import globalErrorHandler from "../middleware/globalErrorHandler.js";

const invoke = (error) => {
  let statusCode;
  let body;
  const res = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      body = value;
      return value;
    },
  };

  globalErrorHandler(error, {}, res, () => {});
  return { statusCode, body };
};

test("production errors do not expose stack traces", () => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const result = invoke(new AppError(503, "Service unavailable"));
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.message, "Service unavailable");
    assert.equal("err" in result.body, false);
    assert.equal("stack" in result.body, false);
  } finally {
    if (originalEnvironment == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  }
});

test("development errors include diagnostics", () => {
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    const error = new Error("Diagnostic error");
    const result = invoke(error);
    assert.equal(result.statusCode, 500);
    assert.equal(result.body.err, error);
    assert.match(result.body.stack, /Diagnostic error/);
  } finally {
    if (originalEnvironment == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  }
});
