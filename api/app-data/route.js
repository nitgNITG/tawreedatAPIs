import express from "express";
import parsePhoneNumber from "libphonenumber-js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import authorization from "../../middleware/authorization.js";
import prisma from "../../prisma/client.js";
import { z } from "zod";
import FeatureApi from "../../utils/FetchDataApis.js";

const router = express.Router();
const aboutAppSchema = (lang) => {
  return z.object({
    terms: z.string().optional().nullable(),
    termsAr: z.string().optional().nullable(),
    about: z.string().optional().nullable(),
    aboutAr: z.string().optional().nullable(),
    privacy_policy: z.string().optional().nullable(),
    privacy_policyAr: z.string().optional().nullable(),
    mission: z.string().optional().nullable(),
    missionAr: z.string().optional().nullable(),
    vision: z.string().optional().nullable(),
    visionAr: z.string().optional().nullable(),
    phone: z
      .string({ message: getTranslation(lang, "invalid_phone") })
      .refine(
        (phone) => {
          return parsePhoneNumber(phone)?.isValid();
        },
        { message: getTranslation(lang, "invalid_phone") }
      )
      .optional()
      .nullable(),
    email: z
      .email({ message: getTranslation(lang, "invalid_email") })
      .optional()
      .nullable(),
    digitalCard: z.string().optional().nullable(),
    digitalCardAr: z.string().optional().nullable(),
    facebook: z.string().optional().nullable(),
    twitter: z.string().optional().nullable(),
    instagram: z.string().optional().nullable(),
    linkedin: z.string().optional().nullable(),
    tiktok: z.string().optional().nullable(),
    youtube: z.string().optional().nullable(),
    pinterest: z.string().optional().nullable(),
    snapchat: z.string().optional().nullable(),
    whatsapp: z.string().optional().nullable(),
    telegram: z.string().optional().nullable(),
    reddit: z.string().optional().nullable(),
  });
};
router
  .route("/")
  .put(authorization(), async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin?.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_authorized") });
      }
      const resultValidation = aboutAppSchema(lang).safeParse(req.body);
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
      const aboutApp = await prisma.aboutApp.upsert({
        where: { id: "about-app" },
        update: { id: "about-app", ...data },
        create: { id: "about-app", ...data },
      });
      return res
        .status(200)
        .json({ aboutApp, message: getTranslation(lang, "success") });
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
      const data = new FeatureApi(req).fields().data;

      const appData = await prisma.aboutApp.findFirst({
        where: { id: "about-app" },
        ...data,
      });
      return res
        .status(200)
        .json({ appData, message: getTranslation(lang, "success") });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
