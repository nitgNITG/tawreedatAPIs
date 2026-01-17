import express from "express";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { updateProductRatings } from "../route.js";
import { reviewSchema } from "../../../schemas/product.reviews.js";
import isExpired from "../../../utils/isExpired.js";

const router = express.Router();

router
  .route("/:id")
  .put(authorization(), async (req, res) => {
    const lang = langReq(req);
    const id = req.params.id;
    try {
      const isAdmin = req.user.role === "admin";
      const isReviewExist = await prisma.review.findUnique({
        where: { id },
      });
      if (!isReviewExist) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "review_not_found") });
      }

      // Only admin or owner can update
      if (!isAdmin && isReviewExist.userId !== req.user.id) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const reviewCreatedAt = isReviewExist.createdAt;
      const UPDATE_WINDOW_MINUTES = 15 * 24 * 60; // 15 days in minutes

      // Check if the review is expired for a normal user trying to update
      if (!isAdmin && isExpired(reviewCreatedAt, UPDATE_WINDOW_MINUTES)) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "review_update_expired") });
      }

      const resultValidation = reviewSchema(lang, isAdmin)
        .partial()
        .refine(
          (data) => {
            if (!isAdmin) {
              // Normal users: only rating or comment
              return data.rating !== undefined || data.comment !== undefined;
            }
            // Admin: rating, comment, or status
            return (
              data.rating !== undefined ||
              data.comment !== undefined ||
              data.status !== undefined
            );
          },
          {
            message: getTranslation(lang, "update_one_field"), // make sure this key exists in your translations
          }
        )
        .safeParse(req.body);

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
      delete data.productId;

      const contentChanged =
        (data.rating !== undefined && data.rating !== isReviewExist.rating) ||
        (data.comment !== undefined && data.comment !== isReviewExist.comment);

      if (isReviewExist.status === "APPROVED" && contentChanged && !isAdmin) {
        // Force status back to PENDING for moderation
        data.status = "PENDING";
      }

      const review = await prisma.review.update({
        where: { id },
        data,
      });

      res
        .status(200)
        .json({ message: getTranslation(lang, "success"), review });

      if (data.rating !== undefined && data.rating !== isReviewExist.rating) {
        await updateProductRatings({ productId: review.productId });
      }
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .get(authorization(), async (req, res) => {
    const lang = langReq(req);
    const id = req.params.id;
    try {
      const data = new FeatureApi(req).fields().data;
      const review = await prisma.review.findUnique({
        where: { id },
        ...data,
      });
      if (!review) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "review_not_found") });
      }
      const user = req.user;
      const isAdmin = req.user.role === "admin";
      if (!isAdmin || user.id !== review.userId) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      res.status(200).json({
        message: getTranslation(lang, "success"),
        review,
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization(), async (req, res) => {
    const lang = langReq(req);
    const id = req.params.id;
    try {
      const isReviewExist = await prisma.review.findUnique({
        where: { id },
      });
      if (!isReviewExist) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "review_not_found") });
      }
      const isAdmin = req.user.role === "admin";
      const user = req.user;
      if (!isAdmin || user.id !== isReviewExist.userId) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      await prisma.review.delete({
        where: { id },
      });

      res.status(200).json({
        message: getTranslation(lang, "success"),
      });
      const data = { productId: isReviewExist.productId };
      await updateProductRatings(data);
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
