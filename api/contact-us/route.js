import express from "express";
import { z } from "zod";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import { db } from "../../firebase/admin.js";
import pushNotification from "../../utils/push-notification.js";
import authorization from "../../middleware/authorization.js";

const router = express.Router();

const contactUsSchema = (lang) => {
  return z.object({
    name: z.string({ message: getTranslation(lang, "name_required") }),
    message: z.string({ message: getTranslation(lang, "contact_us_message") }),
    email: z.email({ message: getTranslation(lang, "invalid_email") }),
  });
};
router
  .route("/")
  .post(async (req, res) => {
    const lang = langReq(req);
    try {
      const resultValidation = contactUsSchema(lang).safeParse(req.body);
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
      const contact = await prisma.contactUs.create({
        data,
      });
      delete contact.id;
      await db.collection("contacts").add({ ...contact });
      res.status(201).json({
        message: getTranslation(lang, "contact_us_success"),
      });
      await pushNotification({
        key: {
          title: `${data.email} Send message in Email`,
          desc: `${data?.message?.slice(0, 150) + "..." || ""}`,
        },
        data: {
          route: `/${lang}/contact`,
          navigate: "contact",
        },
        lang,
      });
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
    try {
      const data = new FeatureApi(req)
        .filter()
        .fields()
        .limit(10)
        .sort()
        .skip()
        .keyword(["name", "email", "message"], "OR")
        .distinct().data;
      const totalCount = await prisma.contactUs.count({ where: data.where });
      const totalPages = Math.ceil(totalCount / data.take);
      const contacts = await prisma.contactUs.findMany(data);

      return res.status(200).json({ contacts, totalPages, totalCount });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
