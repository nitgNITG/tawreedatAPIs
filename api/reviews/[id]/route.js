import express from "express";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { updateProductRatings, reviewSchema } from "../route.js";

const router = express.Router();

router
  .route("/:id")
  .put(authorization, async (req, res) => {
    const lang = langReq(req);
    const id = req.params.id;
    try {
      const isAdmin = req.user.role === "ADMIN";
      if (!isAdmin) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const isReviewExist = await prisma.review.findUnique({
        where: { id },
      });
      if (!isReviewExist) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "review_not_found") });
      }

      const resultValidation = reviewSchema(lang, true)
        .partial()
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
      console.log(data);
      delete data.productId; // Prevent changing productId

      const review = await prisma.review.update({
        where: { id },
        data,
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
      const isAdmin = req.user.role === "ADMIN";
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
  .delete(authorization, async (req, res) => {
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
      const isAdmin = req.user.role === "ADMIN";
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
