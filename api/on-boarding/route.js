import express from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import authorization from "../../middleware/authorization.js";
import prisma from "../../prisma/client.js";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import onBoardingSchema from "../../schemas/onBoarding.schema.js";

const router = express.Router();

router
  .route("/")
  .post(
    authorization({ roles: ["admin"] }),
    upload.single("image_url"),
    async (req, res) => {
      const lang = langReq(req);

      try {
        const schema = onBoardingSchema(lang);

        const resultValidation = schema.safeParse(req.body);

        if (!resultValidation.success) {
          return res.status(400).json({
            message: resultValidation.error.issues[0].message,
            errors: resultValidation.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          });
        }

        const file = req.file;
        if (!file) {
          return res.status(400).json({
            message: getTranslation(lang, "onBoarding_image_required"),
          });
        }

        const image_url = await uploadImage(file, `/onboarding/${Date.now()}`);

        const data = resultValidation.data;

        const onBoarding = await prisma.onBoarding.create({
          data: {
            title: data.title,
            title_ar: data.title_ar,
            subtitle: data.subtitle,
            subtitle_ar: data.subtitle_ar,
            content: data.content,
            content_ar: data.content_ar,
            sort_id: data.sort_id ?? 0,
            image_url,
          },
        });

        return res.status(201).json({
          onBoarding,
          message: getTranslation(lang, "onBoarding_success_created"),
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({
          message: getTranslation(lang, "internalError"),
          error: error.message,
        });
      }
    },
  )
  .get(async (req, res) => {
    const lang = langReq(req);

    try {
      const data = new FeatureApi(req)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit()
        .keyword(["title", "content", "subtitle"], "OR").data;

      const onBoarding = await prisma.onBoarding.findMany(data);

      return res.status(200).json({
        onBoarding,
        message: getTranslation(lang, "success"),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
