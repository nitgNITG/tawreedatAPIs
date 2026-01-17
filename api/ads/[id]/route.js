import express from "express";
import authorization from "../../../middleware/authorization.js";
import upload from "../../../middleware/upload.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import uploadImage from "../../../utils/uploadImage.js";
import deleteImage from "../../../utils/deleteImage.js";
import prisma from "../../../prisma/client.js";
import { adsSchema } from "../route.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();

router
  .route("/:id")
  .get(async (req, res) => {
    const lang = langReq(req);
    try {
      const id = +req.params.id;
      const data = new FeatureApi(req).fields().filter({ id }).data;

      const ad = await prisma.ad.findUnique(data);

      if (!ad) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "ad_not_found") });
      }

      res.status(200).json({ ad });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  .put(authorization(), upload.single("imageUrl"), async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const id = +req.params.id;
      const query = new FeatureApi(req).fields().data;
      const resultValidation = adsSchema(lang)
        .partial()
        .check((data, ctx) => {
          if (data.endDate < data.startDate) {
            ctx.addIssue({
              message: getTranslation(lang, "date_Invalid_between"),
              path: ["endDate"],
            });
          }
        })
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
      const ad = await prisma.ad.findUnique({
        where: { id },
      });

      if (!ad) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "ad_not_found") });
      }

      if (req.file) {
        data.imageUrl = await uploadImage(req.file, `/ads`);
        await deleteImage(ad.imageUrl);
      }

      const updatedAd = await prisma.ad.update({
        where: { id },
        data,
        ...(query ?? {}),
      });

      res
        .status(200)
        .json({ message: getTranslation(lang, "ad_updated"), ad: updatedAd });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  .delete(authorization(), async (req, res) => {
    const lang = langReq(req);
    const id = +req.params.id;
    try {
      const admin = req.user;
      if (admin?.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const ad = await prisma.ad.findUnique({
        where: { id },
      });
      if (!ad) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "ad_not_found") });
      }
      await deleteImage(ad.imageUrl);

      await prisma.ad.delete({
        where: { id },
      });

      res.status(200).json({ message: getTranslation(lang, "ad_deleted") });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
