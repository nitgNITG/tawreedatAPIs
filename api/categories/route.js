import express from "express";
import prisma from "../../prisma/client.js";
import { z } from "zod";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import pushNotification from "../../utils/push-notification.js";

const router = express.Router();
const attributeValueSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  enum: z.array(z.union([z.string(), z.number()])).optional(),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

// const attributesSchema = z.preprocess((val) => {
//   // If we get a string, try to parse it as JSON
//   if (typeof val === "string") {
//     try {
//       console.log("Parsing attributes string:", val);
//       return JSON.parse(val);
//     } catch (e) {
//       console.log("Error parsing attributes string:", e);
//       return {};
//     }
//   }

//   // If it's an object but the values are strings (form data case)
//   if (typeof val === "object" && val !== null) {
//     console.log("Parsing attributes object:", val);

//     const result = {};

//     for (const [key, value] of Object.entries(val)) {
//       try {
//         // Try to parse each value as JSON if it's a string
//         if (typeof value === "string") {
//           result[key] = JSON.parse(value);
//         } else {
//           result[key] = value;
//         }
//       } catch (e) {
//         console.log(`Error parsing attribute ${key}:`, e);
//         // Skip invalid entries
//       }
//     }
//     console.log("Parsed attributes object:", result);

//     return result;
//   }

//   return val;
// }, z.record(attributeValueSchema));

// Replace your existing attributesSchema with this:
const attributesSchema = z.preprocess(
  (val) => {
    // If it's a string, try to parse it as JSON
    if (typeof val === "string") {
      try {
        console.log("Parsing attributes string:", val);
        return JSON.parse(val);
      } catch (e) {
        console.log("Error parsing attributes string:", e);
        return {};
      }
    }
    return val;
  },
  // This is the key change - we're expecting an object where each value conforms to attributeValueSchema
  z.record(z.string(), attributeValueSchema)
);

export const categorySchema = (lang) => {
  return z.object({
    name: z.string({ message: getTranslation(lang, "category_name") }),
    nameAr: z
      .string({ message: getTranslation(lang, "category_name_ar") })
      .optional(),
    description: z.string().optional(),
    descriptionAr: z.string().optional(),
    imageUrl: z.string().optional(),
    parentId: z
      .union([z.string().transform((val) => parseInt(val)), z.number()])
      .optional(),
    isActive: z
      .union([
        z.string().transform((val) => val === "true" || val === "1"),
        z.boolean(),
      ])
      .optional(),
    deleteImage: z
      .union([
        z.string().transform((val) => val === "true" || val === "1"),
        z.boolean(),
      ])
      .optional(),
    productAttributes: attributesSchema.optional(),
  });
};

router
  .route("/")
  .post(
    authorization,
    upload.fields([{ name: "imageUrl" }, { name: "iconUrl" }]),
    async (req, res) => {
      const lang = langReq(req);
      try {
        const admin = req.user;
        if (admin?.role !== "ADMIN")
          return res
            .status(403)
            .json({ message: getTranslation(lang, "not_allowed") });

        const query = new FeatureApi(req).fields().data;

        const resultValidation = categorySchema(lang).safeParse(req.body);
        if (!resultValidation.success) {
          console.error(resultValidation.error);
          return res.status(400).json({
            message: resultValidation.error.issues[0].message,
            errors: resultValidation.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          });
        }
        const data = resultValidation.data;
        const imageUrl = req.files["imageUrl"]?.[0];
        const iconUrl = req.files["iconUrl"]?.[0];
        if (imageUrl) {
          data.imageUrl = await uploadImage(imageUrl, `/categories`);
        }
        if (iconUrl) {
          data.iconUrl = await uploadImage(iconUrl, `/categories`);
        }

        const category = await prisma.category.create({
          data,
          ...(query ?? {}),
        });
        res.status(200).json({ message: "category_created", category });
        // await pushNotification({
        //   key: {
        //     title: "notification_category_created_title",
        //     desc: "notification_category_created_desc",
        //   },
        //   args: {
        //     title: [],
        //     desc: [admin.fullname, category.name],
        //   },
        //   lang,
        //   users: [],
        //   adminUserId: admin.id,
        //   data: {
        //     navigate: "categories",
        //     route: `/${lang}/categories/${category.id}`,
        //   },
        // });
      } catch (error) {
        console.error(error);
        res.status(400).json({
          message: getTranslation(lang, "internalError"),
          error: error.message,
        });
      }
    }
  )

  .get(async (req, res) => {
    const lang = langReq(req);
    try {
      const { homePage, ...query } = req.query;

      if (homePage) {
        const { numberOfCategoriesOnHomepage } =
          await prisma.applicationSettings.findFirst({
            select: {
              numberOfCategoriesOnHomepage: true,
            },
          });
        query.limit = numberOfCategoriesOnHomepage || 3;
      }
      const tempReq = { ...req, query };
      const data = new FeatureApi(tempReq)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit()
        .keyword(["name"], "OR").data;

      const totalCount = await prisma.category.count({ where: data.where });
      const totalPages = Math.ceil(totalCount / (parseInt(data.take) || 10));

      const categories = await prisma.category.findMany(data);

      return res.status(200).json({
        message: getTranslation(lang, "categories_fetched"),
        categories,
        totalCount,
        totalPages,
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
