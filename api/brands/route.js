import { Router } from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import prisma from "../../prisma/client.js";
import authorization from "../../middleware/authorization.js";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";
import {
  createBrandSchema,
  deleteBrandsSchema,
} from "../../schemas/brand.schema.js";
import deleteImage from "../../utils/deleteImage.js";
import revalidateDashboard from "../../utils/revalidateDashboard.js";
import pushNotification from "../../utils/push-notification.js";

const router = Router();

router
  .route("/")
  .get(async (req, res) => {
    const lang = langReq(req);
    try {
      const data = new FeatureApi(req)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit(10)
        .keyword(
          ["name", "name_ar", "slug", "description", "description_ar"],
          "OR",
        ).data;

      const totalBrands = await prisma.brand.count({ where: data.where });
      const brands = await prisma.brand.findMany(data);
      const totalPages = Math.ceil(
        totalBrands / (Number.parseInt(data.take) || 10),
      );

      return res.status(200).json({ brands, totalPages, totalBrands });
    } catch (error) {
      console.error(error.message);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .post(
    authorization({ roles: ["admin"] }),
    upload.fields([{ name: "logo_url" }, { name: "cover_url" }]),
    async (req, res) => {
      const lang = langReq(req);

      try {
        const admin = req.user;
        const query = new FeatureApi(req).fields().data;

        const resultValidation = createBrandSchema(lang)
          .refine((data) => {
            data.categories = {
              create: data.categories?.map((id) => ({ category_id: id })) || [],
            };

            data.products = {
              create: data.products?.map((id) => ({ productId: id })) || [],
            };

            return true;
          })
          .safeParse(req.body);

        if (!resultValidation.success) {
          console.log("Validation failed:", resultValidation.error);

          return res.status(400).json({
            message: resultValidation.error.issues[0].message,
            errors: resultValidation.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          });
        }

        const data = resultValidation.data;

        const cover = req.files?.["cover_url"]?.[0];
        const logo = req.files?.["logo_url"]?.[0];

        if (cover) data.cover_url = await uploadImage(cover, `/brands`);
        if (logo) data.logo_url = await uploadImage(logo, `/brands`);

        const brand = await prisma.brand.create({
          data,
          ...(query ?? []),
        });

        res.status(201).json({
          message: getTranslation(lang, "created_successfully"),
          brand,
        });

        await revalidateDashboard("brands");

        await pushNotification({
          key: {
            title: "notification_brand_created_title",
            desc: "notification_brand_created_desc",
          },
          args: {
            title: [],
            desc: [admin.full_name, brand.name, brand.name_ar],
          },
          lang,
          users: [],
          adminUserId: admin.id,
          data: {
            navigate: "brands",
            route: `/${lang}/brands/${brand.id}`,
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

    try {
      const resultValidation = deleteBrandsSchema(lang).safeParse(req.body);

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

      /* ------------------------------------------------
       * 1️⃣ Permanently delete ALL soft-deleted brands
       * ------------------------------------------------ */
      if (data.isDeleted) {
        const brands = await prisma.brand.findMany({
          where: {
            deleted_at: { not: null },
          },
          select: { cover_url: true, logo_url: true },
        });

        for (const brand of brands) {
          await deleteImage(brand.cover_url);
          await deleteImage(brand.logo_url);
        }

        const count = await prisma.brand.deleteMany({
          where: {
            deleted_at: { not: null },
          },
        });

        res.status(200).json({
          message: getTranslation(lang, "deleted_successfully"),
          count,
        });
        await revalidateDashboard("brands");
        return;
      }

      /* ------------------------------------------------
       * 2️⃣ Permanently delete ALL not-active brands
       * ------------------------------------------------ */
      if (data.notActive) {
        const brands = await prisma.brand.findMany({
          where: { is_active: false },
          select: { cover_url: true, logo_url: true },
        });

        for (const brand of brands) {
          await deleteImage(brand.cover_url);
          await deleteImage(brand.logo_url);
        }

        const count = await prisma.brand.deleteMany({
          where: { is_active: false },
        });

        res.status(200).json({
          message: getTranslation(lang, "deleted_successfully"),
          count,
        });

        await revalidateDashboard("brands");
        return;
      }

      /* ------------------------------------------------
       * 3️⃣ Permanently delete selected IDs
       * ------------------------------------------------ */
      if (data.ids && data.permanent) {
        const brands = await prisma.brand.findMany({
          where: { id: { in: data.ids } },
          select: { cover_url: true, logo_url: true },
        });

        for (const brand of brands) {
          await deleteImage(brand.cover_url);
          await deleteImage(brand.logo_url);
        }

        const count = await prisma.brand.deleteMany({
          where: { id: { in: data.ids } },
        });

        res.status(200).json({
          message: getTranslation(lang, "deleted_successfully"),
          count,
        });

        await revalidateDashboard("brands");
        return;
      }

      /* ------------------------------------------------
       * 4️⃣ Soft delete selected IDs (SET deleted_at)
       * ------------------------------------------------ */
      const count = await prisma.brand.updateMany({
        where: { id: { in: data.ids } },
        data: {
          deleted_at: new Date(),
          is_active: false,
        },
      });

      res.status(200).json({
        message: getTranslation(lang, "deleted_successfully"),
        count,
      });

      await revalidateDashboard("brands");
      return;
    } catch (error) {
      console.error(error);
      return res.status(500).send(error.message);
    }
  });

export default router;
