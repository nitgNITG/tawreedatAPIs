import express from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import authorization from "../../middleware/authorization.js";
import prisma from "../../prisma/client.js";
import upload from "../../middleware/upload.js";
import { z } from "zod";
import uploadImage from "../../utils/uploadImage.js";
import FeatureApi from "../../utils/FetchDataApis.js";

const router = express.Router();
export const onBoardingSchema = (lang) => {
  return z.object({
    title: z.string({
      message: getTranslation(lang, "onBoarding_title_required"),
    }),
    titleAr: z.string().optional(),
    subtitle: z.string().optional(),
    subtitleAr: z.string().optional(),
    content: z.string().optional(),
    contentAr: z.string().optional()
  });
};
router
  .route("/")
  .post(authorization, upload.single("imageUrl"), async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (!admin && admin.role !== "ADMIN") {
        return res
          .status(401)
          .json({ message: getTranslation(lang, "not_authorized") });
      }
      const resultValidation = onBoardingSchema(lang).safeParse(req.body);
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
      const imageUrl = req.file;
      if (!imageUrl) {
        return res
          .status(200)
          .json({ message: getTranslation(lang, "onBoarding_image_required") });
      }
      data.imageUrl = await uploadImage(imageUrl, `/onboarding/${Date.now()}`);
      const onBoarding = await prisma.onBoarding.create({
        data,
      });
      return res.status(201).json({
        onBoarding,
        message: getTranslation(lang, "onBoarding_success_created"),
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  .get(async (req, res) => {
    const lang = langReq(req);
    try {
      const data = new FeatureApi(req)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit()
        .keyword(["title", "content"], "OR").data;
      const onBoarding = await prisma.onBoarding.findMany(data);
      return res.status(200).json({
        onBoarding,
        message: getTranslation(lang, "success"),
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
