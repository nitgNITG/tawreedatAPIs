import express from "express";
import authorization from "../../middleware/authorization.js";
import { z } from "zod";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import prisma from "../../prisma/client.js";

const router = express.Router();
export const faqsSchema = (lang = "en") => {
  return z.object({
    question: z.string({
      message: getTranslation(lang, "faqs_question_required"),
    }),
    answer: z.string({ message: getTranslation(lang, "faqs_answer_required") }),
    language: z
      .enum(["EN", "AR"], { message: getTranslation(lang, "faqs_language") })
      .default("EN"),
  });
};
router
  .route("/")
  .post(authorization, async (req, res) => {
    const lang = langReq(req);
    try {
      const user = req.user;
      if (user.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }
      const resultValidation = faqsSchema(lang).safeParse(req.body);
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
      const faq = await prisma.faqs.create({
        data,
      });
      return res.status(201).json({
        message: getTranslation(lang, "faqs_success_message"),
        faq,
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
        .filter()
        .fields()
        .sort()
        .keyword(["question", "answer"], "OR")
        .skip()
        .limit()
        .distinct().data;
      const faqs = await prisma.faqs.findMany(data);
      return res.status(200).json({ faqs });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });
export default router;
