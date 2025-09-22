import express from "express";
import authorization from "../../../middleware/authorization.js";
import upload from "../../../middleware/upload.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import { categorySchema } from "../route.js";
import uploadImage from "../../../utils/uploadImage.js";
import deleteImage from "../../../utils/deleteImage.js";
import pushNotification from "../../../utils/push-notification.js";

const router = express.Router();

router
  .route("/:id")
  .get(async (req, res) => {
    const id = +req.params.id;
    const lang = langReq(req);
    try {
      const data = new FeatureApi(req).filter({ id }).fields().data;
      const category = await prisma.category.findUnique(data);

      if (!category) {
        return res.status(404).json({
          message: getTranslation(lang, "category_not_found"),
        });
      }

      res
        .status(200)
        .json({ message: getTranslation(lang, "category_fetched"), category });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(
    authorization,
    upload.fields([{ name: "imageUrl" }, { name: "iconUrl" }]),
    async (req, res) => {
      const id = +req.params.id;
      const lang = langReq(req);
      try {
        const admin = req.user;
        if (admin?.role !== "ADMIN") {
          return res
            .status(403)
            .json({ message: getTranslation(lang, "not_allowed") });
        }
        const query = new FeatureApi(req).fields().data;
        const resultValidation = categorySchema(lang)
          .partial()
          .safeParse(req.body);
        if (!resultValidation.success) {
          return res.status(400).json({
            message: resultValidation.error.errors[0].message,
            errors: resultValidation.error.errors,
          });
        }
        const cate = await prisma.category.findUnique({ where: { id } });
        if (!cate) {
          return res.status(404).json({
            message: getTranslation(lang, "category_not_found"),
          });
        }
        const data = resultValidation.data;
        const imageUrl = req?.files?.["imageUrl"]?.[0];
        const iconUrl = req?.files?.["iconUrl"]?.[0];
        if (imageUrl) {
          data.imageUrl = await uploadImage(imageUrl, `/categories`);
        }
        if (iconUrl) {
          data.iconUrl = await uploadImage(iconUrl, `/categories`);
        }
        if (data.deleteImage) {
          await deleteImage(cate.imageUrl);
          await deleteImage(cate.iconUrl);
          data.imageUrl = null;
          data.iconUrl = null;
          delete data.deleteImage;
        }
        const category = await prisma.category.update({
          where: { id },
          data,
          ...(query ?? {}),
        });
        res.status(200).json({
          message: getTranslation(lang, "category_updated"),
          category,
        });

        await pushNotification({
          key: {
            title: "notification_category_updated_title",
            desc: "notification_category_updated_desc",
          },
          args: {
            title: [],
            desc: [admin.fullname, category.name],
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
        res.status(400).json({
          message: getTranslation(lang, "internalError"),
          error: error.message,
        });
      }
    }
  )
  .delete(authorization, async (req, res) => {
    const id = +req.params.id;
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin?.role !== "ADMIN")
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      const cate = await prisma.category.findUnique({ where: { id } });
      if (!cate) {
        return res.status(404).json({
          message: getTranslation(lang, "category_not_found"),
        });
      }
      const category = await prisma.category.delete({
        where: {
          id,
        },
      });
      await deleteImage(category.imageUrl);
      res
        .status(200)
        .json({ message: getTranslation(lang, "success_delete_category") });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
