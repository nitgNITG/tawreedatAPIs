import express from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import prisma from "../../prisma/client.js";
import { z } from "zod";
import authorization from "../../middleware/authorization.js";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";
import sanitizeHtml from "sanitize-html";

/**
 * @param {string} title
 * @returns {string}
 */
export const slugify = (title) => {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-")
    .trim();
};

export const articleSchema = (lang) => {
  return z
    .object({
      title: z
        .string({ message: getTranslation(lang, "title_required") })
        .min(1, { message: getTranslation(lang, "title_required") })
        .max(100, { message: getTranslation(lang, "title_too_long") }),
      slug: z
        .string({ message: getTranslation(lang, "slug_required") })
        .min(1, { message: getTranslation(lang, "slug_required") })
        .max(100, { message: getTranslation(lang, "slug_too_long") })
        .optional(),
      summary: z
        .string({ message: getTranslation(lang, "summary_required") })
        .min(1, { message: getTranslation(lang, "summary_required") })
        .max(500, { message: getTranslation(lang, "summary_too_long") }),
      content: z
        .string({ message: getTranslation(lang, "content_required") })
        .min(1, { message: getTranslation(lang, "content_required") })
        .max(2000, { message: getTranslation(lang, "content_too_long") })
        .transform((value) =>
          sanitizeHtml(value, {
            allowedTags: [
              "h1",
              "h2",
              "h3",
              "p",
              "a",
              "ul",
              "ol",
              "li",
              "strong",
              "em",
              "blockquote",
              "code",
              "pre",
              "img",
              "br",
              "span",
            ],
            allowedAttributes: {
              a: ["href", "name", "target", "rel"],
              img: ["src", "alt", "title", "width", "height"],
              span: ["style"],
            },
            allowedSchemes: ["http", "https", "mailto"],
          })
        ),
      keywords: z
        .string({ message: getTranslation(lang, "keywords_required") })
        .transform((value) => value.split(",").map((keyword) => keyword.trim()))
        .refine((value) => value.length <= 10, {
          message: getTranslation(lang, "keywords_too_many"),
        })
        .transform((transformedKeywords) => transformedKeywords.join(",")),
      publishedAt: z
        .string()
        .transform(
          (value) => {
            const date = new Date(value);
            return isNaN(date.getTime()) ? undefined : date;
          },
          { message: getTranslation(lang, "publishedAt_invalid") }
        )
        .optional(),
      author: z
        .string({ message: getTranslation(lang, "author_required") })
        .min(1, { message: getTranslation(lang, "author_required") })
        .max(100, { message: getTranslation(lang, "author_too_long") }),
    })
    .transform((data) => ({
      ...data,
      slug: data.slug ? data.slug : slugify(data.title),
    }));
};

const router = express.Router();
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

      const resultValidation = articleSchema(lang).safeParse(req.body);

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

      const isSlug = await prisma.article.findUnique({
        where: { slug: data.slug },
      });
      if (isSlug)
        return res.status(400).json({
          slug: isSlug.slug,
          message: getTranslation(lang, "slug_exists"),
        });

      if (!req.file)
        return res.status(400).json({
          message: getTranslation(lang, "image_required"),
        });

      data.coverImage = await uploadImage(req.file, `/articles/${Date.now()}`);
      const article = await prisma.article.create({
        data,
      });

      const formatArticle = {
        ...article,
        keywords: article.keywords ? JSON.parse(article.keywords) : [],
      };

      return res.status(201).json({
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

  .get(async (req, res) => {
    const lang = langReq(req);
    try {
      const data = new FeatureApi(req)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit(10)
        .keyword(["title", "slug", "keywords"], "OR").data;

      const totalArticles = await prisma.article.count({ where: data.where });
      const totalPages = Math.ceil(totalArticles / (parseInt(data.take) || 10));

      const articles = await prisma.article.findMany(data);
      const formattedArticles = articles.map((article) => ({
        ...article,
        keywords: JSON.parse(article.keywords),
      }));

      res.status(200).json({
        articles: formattedArticles,
        totalArticles,
        totalPages,
      });
    } catch (error) {
      console.error(error.message);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
