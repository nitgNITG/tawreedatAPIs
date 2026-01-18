import { Router } from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import upload from "../../../middleware/upload.js";
import uploadImage from "../../../utils/uploadImage.js";
import deleteImage from "../../../utils/deleteImage.js";
import { updateBrandSchema } from "../../../schemas/brand.schema.js";
import revalidateDashboard from "../../../utils/revalidateDashboard.js";
import pushNotification from "../../../utils/push-notification.js";

const router = Router();

router
  .route("/:id")
  .get(async (req, res) => {
    const lang = langReq(req);
    const id = Number.parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: getTranslation(lang, "invalid_brand_id"),
      });
    }

    try {
      const data = new FeatureApi(req).fields().filter({ id }).data;
      const brand = await prisma.brand.findUnique(data);

      if (!brand) {
        return res.status(404).json({
          message: getTranslation(lang, "brand_not_found"),
        });
      }

      return res.status(200).json(brand);
    } catch (error) {
      console.error(error.message);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(
    authorization({ roles: ["admin"] }),
    upload.fields([{ name: "logo_url" }, { name: "cover_url" }]),
    async (req, res) => {
      const lang = langReq(req);
      const id = Number.parseInt(req.params.id);

      if (Number.isNaN(id)) {
        return res.status(400).json({
          message: getTranslation(lang, "invalid_brand_id"),
        });
      }

      try {
        const admin = req.user;
        const query = new FeatureApi(req).fields().data;

        // ✅ include current relations so we can diff categories
        const existingBrand = await prisma.brand.findUnique({
          where: { id },
          include: {
            categories: {
              select: { id: true, category_id: true }, // ✅ snake_case join table
            },
            products: {
              select: { id: true }, // ⚠️ keep as-is (depends on your Product relation)
            },
          },
        });

        if (!existingBrand) {
          return res.status(404).json({
            message: getTranslation(lang, "brand_not_found"),
          });
        }

        const resultValidation = updateBrandSchema(lang)
          .refine((data) => {
            // ✅ categories diff + upsert (BrandCategory now uses category_id)
            if (data.categories && data.categories.length > 0) {
              const categoryIdsToDelete = existingBrand.categories
                .filter((c) => !data.categories.includes(c.category_id))
                .map((c) => ({ id: c.id }));

              data.categories = {
                ...(categoryIdsToDelete.length
                  ? { deleteMany: categoryIdsToDelete }
                  : {}),
                upsert: data.categories.map((catId) => ({
                  where: {
                    // Prisma name for composite unique might differ.
                    // If your @@unique has a name (map), use that name here.
                    brand_id_category_id: {
                      brand_id: existingBrand.id,
                      category_id: catId,
                    },
                  },
                  create: { category_id: catId },
                  update: { category_id: catId },
                })),
              };
            }

            // ⚠️ products: keep your logic, but adjust if products are FK-based
            if (data.products && data.products.length > 0) {
              data.products = {
                set: data.products.map((id) => ({ productId: id })),
              };
            }

            return true;
          })
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

        // ✅ Handle file uploads (snake_case)
        const cover = req.files?.["cover_url"]?.[0];
        const logo = req.files?.["logo_url"]?.[0];

        if (cover) {
          data.cover_url = await uploadImage(cover, `/brands`);
          await deleteImage(existingBrand.cover_url);
        }

        if (logo) {
          data.logo_url = await uploadImage(logo, `/brands`);
          await deleteImage(existingBrand.logo_url);
        }

        // ✅ Handle removed images (snake_case flags from schema)
        if (data.deleteCoverUrl) {
          data.cover_url = null;
          await deleteImage(existingBrand.cover_url);
        }

        if (data.deleteLogoUrl) {
          data.logo_url = null;
          await deleteImage(existingBrand.logo_url);
        }

        delete data.deleteCoverUrl;
        delete data.deleteLogoUrl;

        const updatedBrand = await prisma.brand.update({
          where: { id },
          data,
          ...(query ?? []),
        });

        res.status(200).json({
          message: getTranslation(lang, "brand_updated"),
          brand: updatedBrand,
        });

        await revalidateDashboard("brands");

        await pushNotification({
          key: {
            title: "notification_brand_updated_title",
            desc: "notification_brand_updated_desc",
          },
          args: {
            title: [],
            desc: [admin.full_name, updatedBrand.name, updatedBrand.name_ar],
          },
          lang,
          users: [],
          adminUserId: admin.id,
          data: {
            navigate: "brands",
            route: `/${lang}/brands/${updatedBrand.id}`,
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
    const id = Number.parseInt(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        message: getTranslation(lang, "invalid_brand_id"),
      });
    }

    try {
      const brand = await prisma.brand.findUnique({
        where: { id },
        select: {
          id: true,
          cover_url: true,
          logo_url: true,
          deleted_at: true,
        },
      });

      if (!brand) {
        return res.status(404).json({
          message: getTranslation(lang, "brand_not_found"),
        });
      }

      // permanent delete
      if (req.query.permanent === "true") {
        await prisma.brand.delete({ where: { id } });
        await deleteImage(brand.cover_url);
        await deleteImage(brand.logo_url);

        res.status(200).json({
          message: getTranslation(lang, "brand_deleted_permanently"),
        });

        await revalidateDashboard("brands");
        return;
      }

      // soft delete => deleted_at + is_active false
      await prisma.brand.update({
        where: { id },
        data: {
          deleted_at: new Date(),
          is_active: false,
        },
      });

      res.status(200).json({
        message: getTranslation(lang, "brand_archived"),
      });

      await revalidateDashboard("brands");
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
