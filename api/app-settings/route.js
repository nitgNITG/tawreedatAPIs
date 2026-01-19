import express from "express";
import authorization from "../../middleware/authorization.js";
import prisma from "../../prisma/client.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import applicationSettingsSchema from "../../schemas/app-settings.schema.js";

const router = express.Router();

router
  .route("/")
  .get(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    try {
      const data = new FeatureApi(req).fields().data;
      const settings = await prisma.applicationSetting.findFirst(data);

      if (!settings) {
        return res.status(404).json({
          message: getTranslation(lang, "settingsNotFound"),
        });
      }

      return res
        .status(200)
        .json({ settings, message: getTranslation(lang, "success") });
    } catch (error) {
      console.error("Error fetching app settings:", error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    try {
      const resultValidation = applicationSettingsSchema(lang).safeParse(
        req.body,
      );

      if (!resultValidation.success) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            resultValidation.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          );
        }

        return res.status(409).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        });
      }
      const data = resultValidation.data;
      const settings = await prisma.applicationSetting.upsert({
        where: { id: "app-settings" },
        update: data,
        create: { id: "app-settings", ...data },
      });

      return res
        .status(200)
        .json({ settings, message: getTranslation(lang, "success") });
    } catch (error) {
      console.error("Error creating app settings:", error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

router.route("/mobile").get(async (req, res) => {
  const lang = langReq(req);
  try {
    const data = new FeatureApi(req).fields().data;
    const settings = await prisma.applicationSetting.findFirst(data);

    if (!settings) {
      return res.status(404).json({
        message: getTranslation(lang, "settingsNotFound"),
      });
    }

    delete settings.paymob_iframes;
    delete settings.paymob_api_key;
    delete settings.paymob_base_url;
    delete settings.paymob_payment_methods;
    delete settings.paymob_public_key;
    delete settings.paymob_secret_key;

    return res
      .status(200)
      .json({ settings, message: getTranslation(lang, "success") });
  } catch (error) {
    console.error("Error fetching app settings:", error);
    return res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
