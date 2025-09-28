import { Router } from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import upload from "../../../middleware/upload.js";
import uploadImage from "../../../utils/uploadImage.js";
import deleteImage from "../../../utils/deleteImage.js";
import { updateBrandSchema } from "../../../schemas/brand.schema.js";

const router = Router();

router
  .route("/:id")
  .get(async (req, res) => {
    const lang = langReq(req);
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
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

      res.status(200).json(brand);
    } catch (error) {
      console.error(error.message);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(
    authorization,
    upload.fields([{ name: "logoUrl" }, { name: "coverUrl" }]),
    async (req, res) => {
      const lang = langReq(req);
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return res.status(400).json({
          message: getTranslation(lang, "invalid_brand_id"),
        });
      }

      try {
        const admin = req.user;
        if (admin?.role !== "ADMIN") {
          return res
            .status(403)
            .json({ message: getTranslation(lang, "not_allowed") });
        }

        const query = new FeatureApi(req).fields().data;

        // Check if brand exists
        const existingBrand = await prisma.brand.findUnique({
          where: { id },
          include: {
            categories: {
              select: { id: true, categoryId: true },
            },
            products: {
              select: {
                id: true,
              },
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
            if (data.categories && data.categories.length > 0) {
              const categoryIdsToDelete = existingBrand.categories
                .filter((c) => !data.categories.includes(c.categoryId))
                .map((c) => {
                  return { id: c.id };
                });

              data.categories = {
                ...(categoryIdsToDelete.length
                  ? {
                      deleteMany: categoryIdsToDelete,
                    }
                  : {}),
                upsert: data.categories.map((id) => ({
                  where: {
                    brandId_categoryId: {
                      brandId: existingBrand.id,
                      categoryId: id,
                    },
                  },
                  create: { categoryId: id },
                  update: { categoryId: id },
                })),
              };
            }
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

        // Handle file uploads
        const cover = req?.files?.["coverUrl"]?.[0];
        const logo = req?.files?.["logoUrl"]?.[0];

        if (cover) {
          data.coverUrl = await uploadImage(cover, `/brands`);
          await deleteImage(existingBrand.coverUrl);
        }

        if (logo) {
          data.logoUrl = await uploadImage(logo, `/brands`);
          await deleteImage(existingBrand.logoUrl);
        }

        // Handle removed images
        if (data.deleteCoverUrl) {
          data.coverUrl = null;
          await deleteImage(existingBrand.coverUrl);
        }

        if (data.deleteLogoUrl) {
          data.logoUrl = null;
          await deleteImage(existingBrand.logoUrl);
        }
        // Remove the delete flags from data to avoid issues with Prisma
        delete data.deleteCoverUrl;
        delete data.deleteLogoUrl;

        const updatedBrand = await prisma.brand.update({
          where: { id },
          data,
          ...(query ?? {}),
        });

        res.status(200).json({
          message: getTranslation(lang, "brand_updated"),
          brand: updatedBrand,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          message: getTranslation(lang, "internalError"),
          error: error.message,
        });
      }
    }
  )
  .delete(authorization, async (req, res) => {
    const lang = langReq(req);
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        message: getTranslation(lang, "invalid_brand_id"),
      });
    }

    try {
      const admin = req.user;
      if (admin?.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      // Check if brand exists
      const brand = await prisma.brand.findUnique({
        where: { id },
      });

      if (!brand) {
        return res.status(404).json({
          message: getTranslation(lang, "brand_not_found"),
        });
      }

      // Option to soft delete or hard delete
      if (req.query.permanent === "true") {
        // Hard delete - remove from database
        await prisma.brand.delete({
          where: { id },
        });
        await deleteImage(brand.coverUrl);
        await deleteImage(brand.logoUrl);

        return res.status(200).json({
          message: getTranslation(lang, "brand_deleted_permanently"),
        });
      } else {
        // Soft delete - mark as deleted and inactive
        await prisma.brand.update({
          where: { id },
          data: {
            isDeleted: true,
            isActive: false,
          },
        });

        return res.status(200).json({
          message: getTranslation(lang, "brand_archived"),
        });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
