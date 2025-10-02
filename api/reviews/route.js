import express from "express";
import { z } from "zod";
import prisma from "../../prisma/client.js";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";

export const reviewSchema = (lang, isAdmin) => {
  const baseSchema = {
    productId: z
      .string({ message: getTranslation(lang, "product_required") })
      .min(1, { message: getTranslation(lang, "product_required") }),
    rating: z
      .number({ message: getTranslation(lang, "rating_required") })
      .min(1, { message: getTranslation(lang, "rating_min") })
      .max(5, { message: getTranslation(lang, "rating_max") }),
    comment: z
      .string({ message: getTranslation(lang, "comment_required") })
      .min(1, { message: getTranslation(lang, "comment_required") })
      .optional(),
  };

  if (isAdmin) {
    baseSchema.status = z
      .enum(["PENDING", "APPROVED", "REJECTED"], {
        message: getTranslation(lang, "invalid_status"),
      })
      .optional();
  }

  return z.object(baseSchema);
};

const router = express.Router();

router
  .route("/")
  .post(authorization, async (req, res) => {
    const lang = langReq(req);
    try {
      const userId = req.user.id;

      const resultValidation = reviewSchema(lang, false).safeParse(req.body);
      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        });
      }
      const data = resultValidation.data;
      console.log(data);

      const review = await prisma.review.upsert({
        where: { userId_productId: { userId, productId: data.productId } },
        update: { rating: data.rating, comment: data.comment },
        create: { ...data, userId },
      });

      res
        .status(200)
        .json({ message: getTranslation(lang, "success"), review });

      await updateProductRatings(data);
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .get(authorization, async (req, res) => {
    const lang = langReq(req);
    try {
      const isAdmin = req.user.role === "ADMIN";
      if (!isAdmin) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const data = new FeatureApi(req)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit(10)
        .keyword(
          [
            "user.fullname",
            "user.email",
            "user.phone",
            "product.name",
            "product.sku",
            "product.nameAr",
            "comment",
          ],
          "OR"
        ).data;
      const reviews = await prisma.review.findMany(data);
      const totalCount = await prisma.review.count({ where: data.where });
      const totalPages = Math.ceil(totalCount / (+data.take || 10));

      res.status(200).json({
        message: getTranslation(lang, "success"),
        reviews,
        totalCount,
        totalPages,
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export async function updateProductRatings(data) {
  try {
    const reviews = await prisma.review.findMany({
      where: {
        productId: data.productId,
        status: "APPROVED",
      },
      select: {
        rating: true,
      },
    });
    const totalReviews = reviews.length;
    const averageRating =
      reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews || 0;
    await prisma.product.update({
      where: { id: data.productId },
      data: { rating: averageRating, totalReviews },
    });
  } catch (error) {
    console.error("Failed to update product ratings:", error);
  }
}

export default router;
