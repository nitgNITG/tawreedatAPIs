import express from "express";
import authorization from "../../middleware/authorization.js";
import prisma from "../../prisma/client.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import { z } from "zod";
import FeatureApi from "../../utils/FetchDataApis.js";
const applicationSettingsSchema = (lang) => {
  return z.object({
    numberOfProductsOnHomepage: z
      .number({
        required_error: getTranslation(lang, "numberOfProductsRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .min(1)
      .default(3),

    numberOfCategoriesOnHomepage: z
      .number({
        required_error: getTranslation(lang, "numberOfCategoriesRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .min(1)
      .default(3),

    numberOfFeaturedProductsOnHomepage: z
      .number({
        required_error: getTranslation(
          lang,
          "numberOfFeaturedProductsRequired"
        ),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .min(1)
      .default(10),

    numberOfLatestOffersOnHomepage: z
      .number({
        required_error: getTranslation(lang, "numberOfLatestOffersRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .min(1)
      .default(3),

    numberOfNewArrivalsOnHomepage: z
      .number({
        required_error: getTranslation(lang, "numberOfNewArrivalsRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .min(1)
      .default(3),
    numberOfAdsOnHomepage: z
      .number({
        required_error: getTranslation(lang, "numberOfAdsOnHomepageRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .min(1)
      .default(3),
    numberOfBrandsOnHomepage: z
      .number({
        required_error: getTranslation(
          lang,
          "numberOfBrandsOnHomepageRequired"
        ),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .min(1)
      .default(3),

    vat: z
      .number({
        required_error: getTranslation(lang, "vatRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .min(0)
      .default(5),

    loginAttemptDurationMinutes: z
      .number({
        required_error: getTranslation(lang, "loginAttemptDurationRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(20),

    loginAttempts: z
      .number({
        required_error: getTranslation(lang, "loginAttemptsRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(5),
    paymentAttempts: z
      .number({
        required_error: getTranslation(lang, "paymentAttemptsRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(5),

    loginAsGuest: z.boolean().default(false),
    permanentDelete: z.boolean().default(false),
    app_android_version: z.string(),
    app_android_url: z.string(),
    app_ios_version: z.string(),
    app_ios_url: z.string(),
    paymob_api_key: z.string().optional(),
    paymob_secret_key: z.string().optional(),
    paymob_public_key: z.string().optional(),
    paymob_base_url: z.url().optional(),
    paymob_payment_methods: z.string().optional(),
    paymob_Iframes: z.string().optional(),
  });
};

const router = express.Router();

router
  .route("/")
  .get(authorization(), async (req, res) => {
    const lang = langReq(req);
    const isAdmin = req.user.role === "admin";
    try {
      if (!isAdmin)
        return res
          .status(403)
          .json({ message: getTranslation(lang, "forbidden") });

      const data = new FeatureApi(req).fields().data;
      const settings = await prisma.applicationSettings.findFirst(data);

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
  .put(authorization(), async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin?.role !== "admin")
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_authorized") });

      const resultValidation = applicationSettingsSchema(lang).safeParse(
        req.body
      );

      if (!resultValidation.success) {
        if (process.env.NODE_ENV === "development") {
          console.log(
            resultValidation.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            }))
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
      const settings = await prisma.applicationSettings.upsert({
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
    const settings = await prisma.applicationSettings.findFirst(data);

    if (!settings) {
      return res.status(404).json({
        message: getTranslation(lang, "settingsNotFound"),
      });
    }

    delete settings.paymob_Iframes;
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
