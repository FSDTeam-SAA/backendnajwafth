import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { Book } from "../model/book.model.js";
import { Shop } from "../model/shop.model.js";
import { User } from "../model/user.model.js";

// Books belong to seller User IDs, not Shop document IDs. A public storefront
// must have a Shop record and an existing, verified seller owner. Shop approval
// status is intentionally not a public-directory eligibility requirement.
export const getPublicShops = catchAsync(async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 12);
  if (!Number.isSafeInteger(page) || page < 1 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isSafeInteger((page - 1) * limit)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid pagination: page must be positive and limit must be between 1 and 50");
  }

  const [result = { data: [], metadata: [] }] = await Shop.aggregate([
    {
      $lookup: {
        from: User.collection.name,
        localField: "owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    { $unwind: "$owner" },
    {
      $match: {
        "owner.role": "seller",
        "owner.deletedAt": null,
        "owner.verificationInfo.verified": true,
      },
    },
    { $sort: { _id: -1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: Book.collection.name,
              let: { sellerId: "$owner._id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$shopId", "$$sellerId"] },
                  },
                },
                { $count: "count" },
              ],
              as: "bookStats",
            },
          },
          {
            $project: {
              _id: 0,
              id: { $toString: "$owner._id" },
              name: {
                $cond: [
                  { $ne: [{ $ifNull: ["$name", ""] }, ""] },
                  "$name",
                  {
                    $cond: [
                      { $ne: [{ $ifNull: ["$owner.name", ""] }, ""] },
                      "$owner.name",
                      {
                        $cond: [
                          { $ne: [{ $ifNull: ["$owner.username", ""] }, ""] },
                          "$owner.username",
                          "Books store",
                        ],
                      },
                    ],
                  },
                ],
              },
              // No dedicated public Shop logo exists. Do not repurpose the
              // owner's personal avatar without an explicit public-use field.
              logo: { $literal: null },
              banner: {
                $map: {
                  input: {
                    $filter: {
                      input: { $ifNull: ["$banner", []] },
                      as: "image",
                      cond: {
                        $and: [
                          { $ne: ["$$image.url", null] },
                          { $ne: ["$$image.url", ""] },
                        ],
                      },
                    },
                  },
                  as: "image",
                  in: "$$image.url",
                },
              },
              description: { $ifNull: ["$description", ""] },
              address: { $ifNull: ["$address", ""] },
              bookCount: {
                $ifNull: [{ $arrayElemAt: ["$bookStats.count", 0] }, 0],
              },
            },
          },
        ],
      },
    },
  ]);

  const total = result.metadata[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Bookstores retrieved successfully",
    // The aggregation projection is an explicit public allowlist. It never
    // exposes certificates, contacts, tokens, or personal User addresses.
    data: result.data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
    },
  });
});
