import express from "express";
import authorization from "../../../middleware/authorization.js";
import upload from "../../../middleware/upload.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import { categorySchema } from "../../../schemas/category.schema.js"; // ✅ new path
import uploadImage from "../../../utils/uploadImage.js";
import deleteImage from "../../../utils/deleteImage.js";
import pushNotification from "../../../utils/push-notification.js";
import revalidateDashboard from "../../../utils/revalidateDashboard.js";

const router = express.Router();

router
  .route("/:id")
  .get(async (req, res) => {
    const lang = langReq(req);
    const id = Number.parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: getTranslation(lang, "invalid_category_id"),
      });
    }
    try {
      const data = new FeatureApi(req).filter({ id }).fields().data;
      const category = await prisma.category.findUnique(data);

      if (!category) {
        return res.status(404).json({
          message: getTranslation(lang, "category_not_found"),
        });
      }

      return res.status(200).json({
        message: getTranslation(lang, "category_fetched"),
        category,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(
    authorization({ roles: ["admin"] }),
    upload.fields([{ name: "image_url" }, { name: "icon_url" }]),
    async (req, res) => {
      const lang = langReq(req);
      const id = Number.parseInt(req.params.id);

      if (Number.isNaN(id)) {
        return res.status(400).json({
          message: getTranslation(lang, "invalid_category_id"),
        });
      }

      try {
        const admin = req.user;

        const query = new FeatureApi(req).fields().data;

        const resultValidation = categorySchema(lang)
          .partial()
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

        const existing = await prisma.category.findUnique({ where: { id } });
        if (!existing) {
          return res.status(404).json({
            message: getTranslation(lang, "category_not_found"),
          });
        }

        const data = resultValidation.data;

        // ✅ handle uploads (snake_case)
        const imageFile = req.files?.["image_url"]?.[0];
        const iconFile = req.files?.["icon_url"]?.[0];

        if (imageFile) {
          data.image_url = await uploadImage(imageFile, `/categories`);
          // optional: delete old image when replacing
          if (existing.image_url) await deleteImage(existing.image_url);
        }

        if (iconFile) {
          data.icon_url = await uploadImage(iconFile, `/categories`);
          if (existing.icon_url) await deleteImage(existing.icon_url);
        }

        // ✅ handle delete image flag (support both keys to avoid frontend mismatch)
        const shouldDeleteImages =
          data.deleteImage === true || data.delete_image === true;

        if (shouldDeleteImages) {
          if (existing.image_url) await deleteImage(existing.image_url);
          if (existing.icon_url) await deleteImage(existing.icon_url);
          data.image_url = null;
          data.icon_url = null;
          delete data.deleteImage;
          delete data.delete_image;
        }

        // normalize parent_id empty string -> null
        if (data.parent_id === "" || Number.isNaN(data.parent_id)) {
          data.parent_id = null;
        }

        const category = await prisma.category.update({
          where: { id },
          data,
          ...(query ?? []),
        });

        res.status(200).json({
          message: getTranslation(lang, "category_updated"),
          category,
        });

        await revalidateDashboard("categories");

        await pushNotification({
          key: {
            title: "notification_category_updated_title",
            desc: "notification_category_updated_desc",
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
        return res.status(500).json({
          message: getTranslation(lang, "internalError"),
          error: error.message,
        });
      }
    },
  )
  .delete(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    const id = Number.parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: getTranslation(lang, "invalid_category_id"),
      });
    }

    try {
      const category = await prisma.category.findUnique({
        where: { id },
        select: { id: true, image_url: true, icon_url: true, deleted_at: true },
      });

      if (!category) {
        return res.status(404).json({
          message: getTranslation(lang, "category_not_found"),
        });
      }

      // optional permanent delete
      if (req.query.permanent === "true") {
        await prisma.category.delete({ where: { id } });

        if (category.image_url) await deleteImage(category.image_url);
        if (category.icon_url) await deleteImage(category.icon_url);

        res.status(200).json({
          message: getTranslation(lang, "success_delete_category"),
        });

        await revalidateDashboard("categories");
        return;
      }

      // ✅ soft delete (deleted_at)
      await prisma.category.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          is_active: false,
        },
      });

      res.status(200).json({
        message: getTranslation(lang, "category_archived"),
      });

      await revalidateDashboard("categories");
      return;
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
