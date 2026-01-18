import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import upload from "../../../middleware/upload.js";
import uploadImage from "../../../utils/uploadImage.js";
import deleteImage from "../../../utils/deleteImage.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { parseProductImages } from "../../../utils/productImages.js";
import pushNotification from "../../../utils/push-notification.js";
import { productSchema } from "../../../schemas/product.schema.js";
import { updateBrandUpTo } from "../../../utils/brandUpTo.js";
import revalidateDashboard from "../../../utils/revalidateDashboard.js";

const router = express.Router();

// ✅ map camelCase request (schema) -> snake_case DB fields
const toSnakeUpdate = (data) => {
  const out = { ...data };

  if ("nameAr" in out) ((out.name_ar = out.nameAr), delete out.nameAr);
  if ("descriptionAr" in out)
    ((out.description_ar = out.descriptionAr), delete out.descriptionAr);

  if ("costPrice" in out)
    ((out.cost_price = out.costPrice), delete out.costPrice);
  if ("minStock" in out) ((out.min_stock = out.minStock), delete out.minStock);

  if ("isActive" in out) ((out.is_active = out.isActive), delete out.isActive);
  if ("isFeatured" in out)
    ((out.is_featured = out.isFeatured), delete out.isFeatured);

  if ("categoryId" in out)
    ((out.category_id = out.categoryId), delete out.categoryId);
  if ("brandId" in out) ((out.brand_id = out.brandId), delete out.brandId);
  if ("supplierId" in out)
    ((out.supplier_id = out.supplierId), delete out.supplierId);

  if ("offerValidFrom" in out)
    ((out.offer_valid_from = out.offerValidFrom), delete out.offerValidFrom);
  if ("offerValidTo" in out)
    ((out.offer_valid_to = out.offerValidTo), delete out.offerValidTo);

  return out;
};

router
  .route("/:id")
  .get(async (req, res) => {
    const lang = langReq(req);
    const { id } = req.params;

    try {
      const data = new FeatureApi(req).fields().filter({ id }).data;

      const product = await prisma.product.findUnique(data);

      if (!product) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "product_not_found") });
      }

      const formattedProduct = parseProductImages(product);

      return res.status(200).json({
        message: getTranslation(lang, "success"),
        product: formattedProduct,
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
    upload.array("images", 5),
    async (req, res) => {
      const lang = langReq(req);
      const { id } = req.params;

      try {
        const admin = req.user;

        const query = new FeatureApi(req).fields().data;

        const existingProduct = await prisma.product.findUnique({
          where: { id },
          include: { category: true },
        });

        if (!existingProduct) {
          return res
            .status(404)
            .json({ message: getTranslation(lang, "product_not_found") });
        }

        // ✅ category.product_attributes (new)
        let categoryAttributes =
          existingProduct.category?.product_attributes ?? null;

        // still accepting old camelCase body: categoryId
        const incomingCategoryId = req.body.categoryId ?? req.body.category_id;
        if (incomingCategoryId) {
          const newCategory = await prisma.category.findUnique({
            where: { id: Number(incomingCategoryId) },
            select: { product_attributes: true },
          });

          if (!newCategory) {
            return res
              .status(404)
              .json({ message: getTranslation(lang, "category_not_found") });
          }

          categoryAttributes = newCategory.product_attributes;
        }

        const resultValidation = productSchema(
          lang,
          categoryAttributes,
          existingProduct.id,
        )
          .partial()
          .superRefine((data, ctx) => {
            if (
              data.offer &&
              ((!data.offerValidFrom && !existingProduct.offerValidFrom) ||
                (!data.offerValidTo && existingProduct.offerValidTo))
            ) {
              ctx.addIssue({
                code: "custom",
                message: getTranslation(lang, "offer_requires_valid_dates"),
              });
            }
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

        // ✅ schema output is still camelCase -> map to snake_case for DB
        const data = resultValidation.data;

        // delete attributes
        if (data.deleteAttributes) {
          await prisma.productAttribute.deleteMany({
            where: { id: { in: data.deleteAttributes } },
          });
          delete data.deleteAttributes;
        }

        // SKU uniqueness
        if (data.sku && data.sku !== existingProduct.sku) {
          const existingSKU = await prisma.product.findFirst({
            where: { sku: data.sku, NOT: { id } },
          });
          if (existingSKU) {
            return res
              .status(400)
              .json({ message: getTranslation(lang, "sku_already_exists") });
          }
        }

        // barcode uniqueness
        if (data.barcode && data.barcode !== existingProduct.barcode) {
          const existingBarcode = await prisma.product.findFirst({
            where: { barcode: data.barcode, NOT: { id } },
          });
          if (existingBarcode) {
            return res.status(400).json({
              message: getTranslation(lang, "barcode_already_exists"),
            });
          }
        }

        // Prepare updateData (skip image operation flags)
        const updateData = {};
        const imageOperationParams = [
          "deleteSpecificImages",
          "deleteAllImages",
          "replaceImages",
        ];

        for (const key in data) {
          if (
            data[key] !== undefined &&
            !imageOperationParams.includes(key) &&
            data[key] !== existingProduct[key]
          ) {
            updateData[key] = data[key];
          }
        }

        // ---------- IMAGES ----------
        let currentImages = [];
        if (existingProduct.images) {
          try {
            const parsed = JSON.parse(existingProduct.images);
            if (Array.isArray(parsed)) currentImages = parsed;
          } catch {
            currentImages = [];
          }
        }

        let updatedImages = [...currentImages];

        // delete specific images
        if (data.deleteSpecificImages) {
          let imagesToDelete = data.deleteSpecificImages;

          if (typeof imagesToDelete === "string") {
            try {
              imagesToDelete = JSON.parse(imagesToDelete);
            } catch {
              imagesToDelete = [imagesToDelete];
            }
          }
          if (!Array.isArray(imagesToDelete)) imagesToDelete = [imagesToDelete];

          for (const imageToDelete of imagesToDelete) {
            let idx = updatedImages.findIndex((img) => img === imageToDelete);
            if (idx === -1)
              idx = updatedImages.findIndex((img) =>
                img.includes(imageToDelete),
              );

            if (idx === -1) {
              const targetFilename = String(imageToDelete)
                .split("/")
                .pop()
                .split("\\")
                .pop();
              idx = updatedImages.findIndex((img) => {
                const imgFilename = img.split("/").pop().split("\\").pop();
                return imgFilename === targetFilename;
              });
            }

            if (idx !== -1) {
              await deleteImage(updatedImages[idx]);
              updatedImages.splice(idx, 1);
            }
          }
        }

        // delete all images
        if (data.deleteAllImages) {
          for (const image of updatedImages) await deleteImage(image);
          updatedImages = [];
        }

        // upload new images
        if (req.files?.length) {
          const uploadedImages = [];
          for (const file of req.files) {
            uploadedImages.push(await uploadImage(file, "/products"));
          }

          if (data.replaceImages) {
            for (const oldImage of updatedImages) await deleteImage(oldImage);
            updatedImages = uploadedImages;
          } else {
            updatedImages = [...updatedImages, ...uploadedImages];
          }
        }

        if (JSON.stringify(updatedImages) !== JSON.stringify(currentImages)) {
          updateData.images = updatedImages.length
            ? JSON.stringify(updatedImages)
            : null;
        }

        // ✅ update only if changes exist
        let product = existingProduct;
        if (Object.keys(updateData).length) {
          product = await prisma.product.update({
            where: { id },
            data: updateData,
            ...(query ?? []),
          });
        }

        const formattedProduct = parseProductImages(product);

        res.status(200).json({
          message: getTranslation(lang, "success"),
          product: formattedProduct,
        });

        await revalidateDashboard("products");

        // update brand upTo if offer or brand changed
        const incomingBrandId = updateData.brand_id ?? existingProduct.brand_id;
        if (
          ("offer" in updateData && updateData.offer != null) ||
          ("brand_id" in updateData && updateData.brand_id != null)
        ) {
          await updateBrandUpTo(incomingBrandId);
        }

        // ensure brand-category relation exists if both are present
        const finalBrandId = updateData.brand_id ?? existingProduct.brand_id;
        const finalCategoryId =
          updateData.category_id ?? existingProduct.category_id;

        if (finalBrandId && finalCategoryId) {
          await prisma.brandCategory.upsert({
            where: {
              brand_id_category_id: {
                brand_id: finalBrandId,
                category_id: finalCategoryId,
              },
            },
            update: {},
            create: {
              brand_id: finalBrandId,
              category_id: finalCategoryId,
            },
          });
        }

        await pushNotification({
          key: {
            title: "notification_product_updated_title",
            desc: "notification_product_updated_desc",
          },
          args: {
            title: [],
            desc: [
              admin.full_name,
              formattedProduct.name,
              formattedProduct.name_ar,
            ],
          },
          lang,
          users: [],
          adminUserId: admin.id,
          data: {
            navigate: "products",
            route: `/${lang}/products?id=${formattedProduct.id}`,
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
    const { id } = req.params;

    // archived=true -> soft delete (deleted_at)
    const archived = req.query.archived === "true";
    const permanent = req.query.permanent === "true";

    try {
      const existingProduct = await prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "product_not_found") });
      }

      if (archived && !permanent) {
        await prisma.product.update({
          where: { id },
          data: {
            deleted_at: new Date(),
            is_active: false,
          },
        });

        return res.status(200).json({
          message: getTranslation(lang, "product_archived"),
        });
      }

      // permanent delete: delete images + record
      if (existingProduct.images) {
        try {
          const images = JSON.parse(existingProduct.images);
          if (Array.isArray(images)) {
            for (const image of images) await deleteImage(image);
          }
        } catch {}
      }

      await prisma.product.delete({ where: { id } });

      res.status(200).json({
        message: getTranslation(lang, "product_deleted"),
      });

      await revalidateDashboard("products");
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
