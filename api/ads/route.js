import express from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import prisma from "../../prisma/client.js";
import { z } from "zod";
import authorization from "../../middleware/authorization.js";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";

const router = express.Router();

const AdsStatus = z.enum(["Active", "Inactive"]);
const AdsType = z.enum(["Home", "Popup"]);

export const adsSchema = (lang) => {
  return z.object({
    title: z
      .string()
      .min(1, { message: getTranslation(lang, "ads_title_is_required") }),

    titleAr: z
      .string()
      .min(1, { message: getTranslation(lang, "ads_titleAr_is_required") }),

    description: z.string().min(1, {
      message: getTranslation(lang, "ads_description_is_required"),
    }),

    descriptionAr: z.string().min(1, {
      message: getTranslation(lang, "ads_descriptionAr_is_required"),
    }),

    targetUrl: z.url({
      message: getTranslation(lang, "ads_target_url_is_required"),
    }),
    startDate: z
      .union([z.string(), z.date()], {
        message: getTranslation(lang, "invalid_date"),
      })
      .transform((el) => new Date(el)),
    endDate: z
      .union([z.string(), z.date()], {
        message: getTranslation(lang, "invalid_date"),
      })
      .transform((el) => new Date(el)),
    priority: z
      .union([z.string(), z.number()], {
        message: getTranslation(lang, "ads_priority"),
      })
      .transform((el) => +el)
      .refine((el) => {
        return z.number().int().positive().safeParse(el);
      }),
    status: AdsStatus,
    adType: AdsType,
    closable: z
      .union([z.string(), z.boolean()])
      .transform((el) => {
        return el === "true";
      })
      .optional(),
    displayDuration: z
      .union([z.string(), z.number()], {
        message: getTranslation(lang, "ads_times_display_duration"),
      })
      .transform((el) => +el)
      .refine((el) => {
        return z.number().int().positive().safeParse(el);
      }),
  });
};
router
  .route("/")
  .post(authorization, upload.single("imageUrl"), async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin?.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }
      const query = new FeatureApi(req).fields().data;

      const resultValidation = adsSchema(lang)
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
      const imageUrl = req.file;
      if (!imageUrl) {
        return res
          .status(400)
          .json({ message: getTranslation(lang, "ads_image_required") });
      }
      data.imageUrl = await uploadImage(imageUrl, `/ads`);

      const ad = await prisma.ad.create({
        data,
        ...(query ?? {}),
      });

      return res.status(201).json({
        message: getTranslation(lang, "ads_create_success"),
        ad,
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
        .limit(10)
        .keyword(["title", "description"], "OR").data;

      const totalCount = await prisma.ad.count({ where: data.where });
      const totalPages = Math.ceil(totalCount / parseInt(data.take));
      const ads = await prisma.ad.findMany(data);

      res.status(200).json({ ads, totalCount, totalPages });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
