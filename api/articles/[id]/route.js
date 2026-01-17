import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import upload from "../../../middleware/upload.js";
import uploadImage from "../../../utils/uploadImage.js";
import { articleSchema } from "../route.js";
import deleteImage from "../../../utils/deleteImage.js";

const router = express.Router();
router
  .route("/:id")
  .put(authorization(), upload.single("imageUrl"), async (req, res) => {
    const lang = langReq(req);
    const id = +req.params.id;
    try {
      const admin = req.user;
      if (admin?.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const isArticle = await prisma.article.findUnique({
        where: { id },
      });
      if (!isArticle) {
        return res.status(404).json({
          message: getTranslation(lang, "article_not_found"),
        });
      }

      const resultValidation = articleSchema(lang)
        .optional()
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

      if (isArticle.slug !== data.slug) {
        const isSlug = await prisma.article.findUnique({
          where: { slug: data.slug },
        });
        if (isSlug)
          return res.status(400).json({
            slug: isSlug.slug,
            message: getTranslation(lang, "slug_exists"),
          });
      }

      if (req.file) {
        data.coverImage = await uploadImage(
          req.file,
          `/articles/${Date.now()}`
        );
        await deleteImage(isArticle.coverImage);
      }

      const article = await prisma.article.update({
        where: { id },
        data,
      });

      const formatArticle = {
        ...article,
        keywords: article.keywords ? JSON.parse(article.keywords) : [],
      };
      return res.status(200).json({
        message: getTranslation(lang, "success"),
        article: formatArticle,
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
      const admin = req.user;
      if (admin?.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const isArticle = await prisma.article.findUnique({
        where: { id },
      });
      if (!isArticle) {
        return res.status(404).json({
          message: getTranslation(lang, "article_not_found"),
        });
      }

      await deleteImage(isArticle.coverImage);
      await prisma.article.delete({ where: { id } });

      res.status(200).json({
        message: getTranslation(lang, "success"),
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

router.route("/:slug").get(async (req, res) => {
  const lang = langReq(req);
  const slug = req.params.slug;
  try {
    const data = new FeatureApi(req).fields().data;
    const article = await prisma.article.findUnique({
      where: { slug },
      ...data,
    });
    if (!article) {
      return res.status(404).json({
        message: getTranslation(lang, "article_not_found"),
      });
    }

    const formatArticle = {
      ...article,
      keywords: article.keywords ? JSON.parse(article.keywords) : [],
    };

    res.status(200).json({
      article: formatArticle,
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
