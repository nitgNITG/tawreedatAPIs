import express from "express";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import { faqsSchema } from "../route.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();
router
  .route("/:id")
  .get(async (req, res) => {
    const lang = langReq(req);
    const id = +req.params.id;
    try {
      const data = new FeatureApi(req).filter({ id }).fields().data;
      const faq = await prisma.faqs.findUnique(data);
      return res
        .status(200)
        .json({ faq, message: getTranslation(lang, "success") });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(authorization(), async (req, res) => {
    const lang = langReq(req);
    const id = +req.params.id;
    try {
      const user = req.user;
      if (user.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }
      const resultValidation = faqsSchema(lang).partial().safeParse(req.body);
      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        });
      }
      const isFaqs = await prisma.faqs.findUnique({
        where: { id },
      });
      if (!isFaqs) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "faqs_not_found_message") });
      }
      const data = resultValidation.data;
      const faq = await prisma.faqs.update({
        where: { id },
        data,
      });
      return res.status(200).json({
        message: getTranslation(lang, "faqs_updated_message"),
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
  .delete(authorization(), async (req, res) => {
    const lang = langReq(req);
    const id = +req.params.id;
    try {
      const user = req.user;
      if (user.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }
      await prisma.faqs.delete({ where: { id } });
      return res.status(200).json({
        message: getTranslation(lang, "faqs_deleted_message"),
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
