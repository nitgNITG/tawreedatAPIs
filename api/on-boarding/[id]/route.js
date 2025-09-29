import express from "express";
import authorization from "../../../middleware/authorization.js";
import upload from "../../../middleware/upload.js";
import { onBoardingSchema } from "../route.js";
import prisma from "../../../prisma/client.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import deleteImage from "../../../utils/deleteImage.js";
import uploadImage from "../../../utils/uploadImage.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();

router
  .route("/:id")
  .put(authorization, upload.single("imageUrl"), async (req, res) => {
    const lang = langReq(req);
    const id = +req.params.id;
    try {
      const admin = req.user;
      if (!admin && admin.role !== "ADMIN") {
        return res
          .status(401)
          .json({ message: getTranslation(lang, "not_authorized") });
      }
      const resultValidation = onBoardingSchema(lang)
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
      const isOnBoarding = await prisma.onBoarding.findUnique({
        where: { id },
      });
      if (!isOnBoarding) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "onBoarding_notFound") });
      }
      const data = resultValidation.data;
      const imageUrl = req.file;
      if (imageUrl) {
        data.imageUrl = await uploadImage(
          req.file,
          `/onBoarding/${Date.now()}`
        );
        await deleteImage(isOnBoarding.imageUrl);
      }
      const onBoarding = await prisma.onBoarding.update({
        where: {
          id,
        },
        data,
      });
      return res.status(201).json({
        onBoarding,
        message: getTranslation(lang, "onBoarding_success_updated"),
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
    const id = +req.params.id;
    try {
      const data = new FeatureApi(req).filter({ id }).fields().data;
      const onBoarding = await prisma.onBoarding.findUnique(data);
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
  })

  .delete(authorization, async (req, res) => {
    const lang = langReq(req);
    const id = +req.params.id;
    try {
      const admin = req.user;
      if (!admin && admin.role !== "ADMIN") {
        return res
          .status(401)
          .json({ message: getTranslation(lang, "not_authorized") });
      }

      const isOnBoarding = await prisma.onBoarding.findUnique({
        where: { id },
      });
      if (!isOnBoarding) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "onBoarding_notFound") });
      }

      await prisma.onBoarding.delete({
        where: { id },
      });
      await deleteImage(isOnBoarding.imageUrl);
      return res
        .status(200)
        .json({ message: getTranslation(lang, "onBoarding_success_delete") });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
