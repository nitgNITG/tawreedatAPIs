import express from "express";
import prisma from "../../prisma/client.js";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import pushNotification from "../../utils/push-notification.js";
import revalidateDashboard from "../../utils/revalidateDashboard.js";
import { categorySchema } from "../../schemas/category.schema.js";

const router = express.Router();

router
  .route("/")
  .post(
    authorization({ roles: ["admin"] }),
    upload.fields([{ name: "image_url" }, { name: "icon_url" }]),
    async (req, res) => {
      const lang = langReq(req);

      try {
        const admin = req.user;
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

        const imageFile = req.files?.["image_url"]?.[0];
        const iconFile = req.files?.["icon_url"]?.[0];

        if (imageFile)
          data.image_url = await uploadImage(imageFile, `/categories`);
        if (iconFile)
          data.icon_url = await uploadImage(iconFile, `/categories`);

        // normalize parent_id: allow empty string to mean null
        if (data.parent_id === "" || Number.isNaN(data.parent_id))
          data.parent_id = null;

        const category = await prisma.category.create({
          data,
          ...query,
        });

        res.status(201).json({
          message: getTranslation(lang, "category_created"),
          category,
        });

        await revalidateDashboard("categories");

        await pushNotification({
          key: {
            title: "notification_category_created_title",
            desc: "notification_category_created_desc",
          },
          args: {
            title: [],
            desc: [admin.full_name, category.name, category.name_ar],
          },
          lang,
          users: [],
          adminUserId: admin.id,
          data: {
            navigate: "categories",
            route: `/${lang}/categories/${category.id}`,
          },
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          message: getTranslation(lang, "internalError"),
          error: error.message,
        });
      }
    },
  )
  .get(async (req, res) => {
    const lang = langReq(req);

    try {
      const { homePage, ...query } = req.query;
      const tempReq = { ...req, query };
      const data = new FeatureApi(tempReq)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit()
        // add/remove fields based on what exists in your Category model
        .keyword(
          ["name", "name_ar", "synonyms", "description", "description_ar"],
          "OR",
        ).data;

      if (homePage) {
        const { numberOfCategoriesOnHomepage } =
          await prisma.applicationSettings.findFirst({
            select: {
              numberOfCategoriesOnHomepage: true,
            },
          });
        data.take = numberOfCategoriesOnHomepage || 3;
        data.where.parentId = null;
      }

      const totalCount = await prisma.category.count({ where: data.where });
      const totalPages = Math.ceil(
        totalCount / (Number.parseInt(data.take) || 10),
      );

      const categories = await prisma.category.findMany(data);

      return res.status(200).json({
        message: getTranslation(lang, "categories_fetched"),
        categories,
        totalCount,
        totalPages,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
