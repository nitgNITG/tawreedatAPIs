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

      res.status(200).json({
        message: getTranslation(lang, "success"),
        product: formattedProduct,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(authorization(), upload.array("images", 5), async (req, res) => {
    const lang = langReq(req);
    const { id } = req.params;
    try {
      const admin = req.user;

      if (admin.role !== "admin")
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      const query = new FeatureApi(req).fields().data;
      // Find existing product
      const existingProduct = await prisma.product.findUnique({
        where: { id },
        include: { category: true },
      });

      if (!existingProduct)
        return res
          .status(404)
          .json({ message: getTranslation(lang, "product_not_found") });

      let productAttributes = existingProduct.category.productAttributes;
      if (req.body.categoryId) {
        const newCategory = await prisma.category.findUnique({
          where: { id: +req.body.categoryId },
          select: {
            productAttributes: true,
          },
        });
        if (!newCategory)
          return res
            .status(404)
            .json({ message: getTranslation(lang, "category_not_found") });
        productAttributes = newCategory.productAttributes;
      }

      const resultValidation = productSchema(
        lang,
        productAttributes,
        existingProduct.id
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

      const data = resultValidation.data;

      // Debug: Log all received data
      console.log("=== DEBUG: Received data ===");
      console.log("req.body:", req.body);
      console.log("Validation result data:", data);
      console.log("req.files:", req.files?.length || 0, "files");
      console.log("============================");
      if (data.deleteAttributes) {
        await prisma.productAttribute.deleteMany({
          where: {
            id: { in: data.deleteAttributes },
          },
        });
        delete data.deleteAttributes;
      }

      // Check SKU uniqueness if updating SKU
      if (data.sku && data.sku !== existingProduct.sku) {
        const existingSKU = await prisma.product.findFirst({
          where: { sku: data.sku, AND: { NOT: { id } } },
        });
        if (existingSKU)
          return res
            .status(400)
            .json({ message: getTranslation(lang, "sku_already_exists") });
      }

      // Check barcode uniqueness if updating barcode
      if (data.barcode && data.barcode !== existingProduct.barcode) {
        const existingBarcode = await prisma.product.findFirst({
          where: { barcode: data.barcode, AND: { NOT: { id } } },
        });
        if (existingBarcode)
          return res
            .status(400)
            .json({ message: getTranslation(lang, "barcode_already_exists") });
      }

      // Prepare update data with only changed fields
      const updateData = {};

      // Image operation parameters that should not be included in database update
      const imageOperationParams = [
        "deleteSpecificImages",
        "deleteAllImages",
        "replaceImages",
      ];

      // Check each field for changes
      for (const key in data) {
        if (
          data[key] !== existingProduct[key] &&
          data[key] !== undefined &&
          !imageOperationParams.includes(key)
        ) {
          updateData[key] = data[key];
        }
      }

      // Image Handling Operations:
      // 1. deleteSpecificImages: Array or single string of image names/URLs to delete specific images
      // 2. deleteAllImages: Boolean to delete all existing images
      // 3. replaceImages: Boolean to replace all images with newly uploaded ones (default: false, adds to existing)
      // 4. New images (req.files): By default, adds to existing images unless replaceImages is true
      //
      // Examples:
      // - Add new images: Upload files without any flags
      // - Replace all images: Upload files + replaceImages: true
      // - Delete specific images: deleteSpecificImages: ["image1.jpg", "image2.png"]
      // - Delete all images: deleteAllImages: true
      // - Delete some + add new: deleteSpecificImages: ["old.jpg"] + upload new files

      // Handle image operations
      let currentImages = [];
      if (existingProduct.images) {
        try {
          const parsed = JSON.parse(existingProduct.images);
          if (Array.isArray(parsed)) {
            currentImages = parsed;
          }
        } catch (e) {
          console.warn(
            "Failed to parse existingProduct.images as JSON array:",
            e
          );
          currentImages = [];
        }
      }
      let updatedImages = [...currentImages];

      console.log("=== IMAGE OPERATIONS DEBUG ===");
      console.log("Initial current images:", currentImages);
      console.log("Initial updated images:", updatedImages);
      console.log(
        "Has files to upload:",
        !!(req.files && req.files.length > 0)
      );
      console.log("Has deleteSpecificImages:", !!data.deleteSpecificImages);
      console.log("Has deleteAllImages:", !!data.deleteAllImages);
      console.log("Has replaceImages:", !!data.replaceImages);
      console.log("================================");

      // Handle specific image deletion first
      if (data.deleteSpecificImages) {
        console.log(
          "deleteSpecificImages received:",
          data.deleteSpecificImages
        );
        console.log("Current images:", currentImages);

        let imagesToDelete = data.deleteSpecificImages;

        // Handle if it's a JSON string
        if (typeof imagesToDelete === "string") {
          try {
            imagesToDelete = JSON.parse(imagesToDelete);
          } catch (e) {
            console.warn("Failed to parse deleteSpecificImages as JSON:", e);

            // If it's not JSON, treat as single string
            imagesToDelete = [imagesToDelete];
          }
        }

        // Ensure it's an array
        if (!Array.isArray(imagesToDelete)) {
          imagesToDelete = [imagesToDelete];
        }

        console.log("Images to delete (processed):", imagesToDelete);

        for (const imageToDelete of imagesToDelete) {
          console.log("Looking for image to delete:", imageToDelete);

          // Try multiple matching strategies
          let imageIndex = -1;

          // Strategy 1: Exact match
          imageIndex = updatedImages.findIndex((img) => img === imageToDelete);

          // Strategy 2: Check if the image path contains the name
          if (imageIndex === -1) {
            imageIndex = updatedImages.findIndex((img) =>
              img.includes(imageToDelete)
            );
          }

          // Strategy 3: Check filename only (extract filename from both)
          if (imageIndex === -1) {
            const targetFilename = imageToDelete
              .split("/")
              .pop()
              .split("\\")
              .pop();
            imageIndex = updatedImages.findIndex((img) => {
              const imgFilename = img.split("/").pop().split("\\").pop();
              return imgFilename === targetFilename;
            });
          }

          console.log("Found image at index:", imageIndex);

          if (imageIndex !== -1) {
            console.log("Deleting image:", updatedImages[imageIndex]);
            // Delete the actual file
            await deleteImage(updatedImages[imageIndex]);
            // Remove from array
            updatedImages.splice(imageIndex, 1);
          } else {
            console.log("Image not found for deletion:", imageToDelete);
          }
        }

        console.log("Updated images after deletion:", updatedImages);
      } else {
        console.log("No deleteSpecificImages operation");
      }

      // Handle complete image deletion
      if (data.deleteAllImages) {
        console.log("Processing deleteAllImages...");
        for (const image of updatedImages) {
          await deleteImage(image);
        }
        updatedImages = [];
        console.log("All images deleted, updatedImages:", updatedImages);
      } else {
        console.log("No deleteAllImages operation");
      }

      // Handle new image uploads
      if (req.files && req.files.length > 0) {
        console.log("Processing file uploads...");
        const uploadedImages = [];
        for (const file of req.files) {
          const imageUrl = await uploadImage(file, "/products");
          uploadedImages.push(imageUrl);
          console.log("Uploaded image:", imageUrl);
        }
        console.log("All uploaded images:", uploadedImages);

        if (data.replaceImages) {
          console.log("Replacing all images with new uploads...");
          // Replace all existing images with new ones
          for (const oldImage of updatedImages) {
            await deleteImage(oldImage);
          }
          updatedImages = uploadedImages;
        } else {
          console.log("Adding new images to existing ones...");
          // Add new images to existing ones (default behavior)
          updatedImages = [...updatedImages, ...uploadedImages];
        }
        console.log("Updated images after upload processing:", updatedImages);
      } else {
        console.log("No files to upload");
      }

      // Update images if there were any changes
      console.log("=== FINAL IMAGE COMPARISON ===");
      console.log("Original images:", JSON.stringify(currentImages));
      console.log("Final updated images:", JSON.stringify(updatedImages));
      console.log(
        "Images changed:",
        JSON.stringify(updatedImages) !== JSON.stringify(currentImages)
      );
      console.log("===============================");

      if (JSON.stringify(updatedImages) !== JSON.stringify(currentImages)) {
        updateData.images =
          updatedImages.length > 0 ? JSON.stringify(updatedImages) : null;
        console.log("Images will be updated in database:", updateData.images);
      } else {
        console.log("No image changes detected, skipping image update");
      }

      // Only update if there are actual changes
      let product = existingProduct;
      if (Object.keys(updateData).length > 0) {
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
      if (
        (existingProduct.offer !== data.offer && data.offer) ||
        existingProduct.brandId !== data.brandId
      ) {
        await updateBrandUpTo(data.brandId);
      }

      await prisma.brandCategory.upsert({
        where: {
          brandId_categoryId: {
            brandId: data.brandId,
            categoryId: data.categoryId,
          },
        },
        update: {},
        create: {
          brandId: data.brandId,
          categoryId: data.categoryId,
        },
      });
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
            formattedProduct.nameAr,
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
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization(), async (req, res) => {
    const lang = langReq(req);
    const archived = req.query.archived || false;
    const { id } = req.params;
    try {
      const admin = req.user;
      if (admin?.role != "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const existingProduct = await prisma.product.findUnique({
        where: { id },
      });

      if (!existingProduct)
        return res
          .status(404)
          .json({ message: getTranslation(lang, "product_not_found") });

      if (archived) {
        await prisma.product.update({
          where: { id },
          data: { isActive: false },
        });
        return res.status(200).json({
          message: getTranslation(lang, "product_archived"),
        });
      }

      // Delete product images before deleting the product
      if (existingProduct.images) {
        const images = JSON.parse(existingProduct.images);
        for (const image of images) {
          await deleteImage(image);
        }
      }

      // Delete the product
      await prisma.product.delete({
        where: { id },
      });

      res.status(200).json({
        message: getTranslation(lang, "product_deleted"),
      });
      await revalidateDashboard("products");
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
