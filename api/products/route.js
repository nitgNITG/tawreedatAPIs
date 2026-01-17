import express from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import prisma from "../../prisma/client.js";
import authorization from "../../middleware/authorization.js";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";
import {
  parseProductImages,
  parseProductsImages,
} from "../../utils/productImages.js";
import pushNotification from "../../utils/push-notification.js";
import { updateBrandUpTo } from "../../utils/brandUpTo.js";
import {
  deleteProductsSchema,
  productSchema,
} from "../../schemas/product.schema.js";
import revalidateDashboard from "../../utils/revalidateDashboard.js";

// Helper functions for generating SKU and Barcode
const generateSKU = async (categoryId, productName) => {
  try {
    // Get category to use in SKU
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { name: true },
    });

    const categoryPrefix =
      category?.name?.substring(0, 3).toUpperCase() || "PRD";
    const namePrefix = productName
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();

    let sku = `${categoryPrefix}-${namePrefix}-${timestamp}-${random}`;

    // Ensure uniqueness
    let counter = 1;
    while (await prisma.product.findUnique({ where: { sku } })) {
      sku = `${categoryPrefix}-${namePrefix}-${timestamp}-${random}-${counter}`;
      counter++;
    }

    return sku;
  } catch (error) {
    console.error("Error generating SKU:", error);
    // Fallback SKU generation
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `PRD-${timestamp}-${random}`;
  }
};

const generateBarcode = async () => {
  // Generate EAN-13 style barcode (13 digits)
  // First 3 digits: Company prefix (you can customize this)
  const companyPrefix = "123"; // Change this to your company code

  // Next 9 digits: Product code
  const productCode = Math.random().toString().slice(2, 11);

  // Last digit: Check digit (simplified calculation)
  const baseNumber = companyPrefix + productCode;
  let sum = 0;
  for (let i = 0; i < baseNumber.length; i++) {
    const digit = parseInt(baseNumber[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  let barcode = baseNumber + checkDigit;

  // Ensure uniqueness
  let counter = 1;
  while (await prisma.product.findUnique({ where: { barcode } })) {
    const newProductCode = (parseInt(productCode) + counter)
      .toString()
      .padStart(9, "0");
    const newBaseNumber = companyPrefix + newProductCode;
    let newSum = 0;
    for (let i = 0; i < newBaseNumber.length; i++) {
      const digit = parseInt(newBaseNumber[i]);
      newSum += i % 2 === 0 ? digit : digit * 3;
    }
    const newCheckDigit = (10 - (newSum % 10)) % 10;
    barcode = newBaseNumber + newCheckDigit;
    counter++;
  }

  return barcode;
};

const router = express.Router();
router
  .route("/")
  .post(authorization(), upload.array("images", 5), async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin?.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }
      const query = new FeatureApi(req).fields().data;

      const category = await prisma.category.findUnique({
        where: { id: +req.body.categoryId },
        select: {
          productAttributes: true,
        },
      });
      if (!category) {
        return res.status(400).json({
          message: getTranslation(lang, "category_not_found"),
        });
      }

      const resultValidation = productSchema(
        lang,
        category.productAttributes
      ).safeParse(req.body);

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

      // Auto-generate SKU if not provided
      if (!data.sku) {
        data.sku = await generateSKU(data.categoryId, data.name);
      }

      // Auto-generate barcode if not provided
      if (!data.barcode) {
        data.barcode = await generateBarcode();
      }

      // Check if SKU already exists (in case user provided one)
      if (data.sku) {
        const existingSKU = await prisma.product.findUnique({
          where: { sku: data.sku },
        });
        if (existingSKU) {
          return res
            .status(400)
            .json({ message: getTranslation(lang, "sku_already_exists") });
        }
      }

      // Check if barcode already exists (in case user provided one)
      if (data.barcode) {
        const existingBarcode = await prisma.product.findUnique({
          where: { barcode: data.barcode },
        });
        if (existingBarcode) {
          return res
            .status(400)
            .json({ message: getTranslation(lang, "barcode_already_exists") });
        }
      }

      // Handle multiple image uploads
      let imageUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const imageUrl = await uploadImage(file, "/products");
          imageUrls.push(imageUrl);
        }
      }

      // Convert images array to JSON string
      data.images = imageUrls.length > 0 ? JSON.stringify(imageUrls) : null;

      const product = await prisma.product.create({
        data,
        ...(query ?? []),
      });
      // Parse images to array format
      const formattedProduct = parseProductImages(product);

      res.status(201).json({
        message: getTranslation(lang, "product_created_successfully"),
        product: formattedProduct,
      });
      await revalidateDashboard("products");

      await updateBrandUpTo(data.brandId);

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
          title: "notification_product_created_title",
          desc: "notification_product_created_desc",
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

  .get(async (req, res) => {
    const lang = langReq(req);

    try {
      const { homePage, type, ...query } = req.query;
      const tempReq = { ...req, query };

      const data = new FeatureApi(tempReq)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit(10)
        .keyword(["name", "nameAr", "sku", "barcode"], "OR").data;

      if (homePage) {
        const settings = await prisma.applicationSettings.findFirst({
          select: {
            numberOfProductsOnHomepage: true,
            numberOfFeaturedProductsOnHomepage: true,
            numberOfLatestOffersOnHomepage: true,
            numberOfNewArrivalsOnHomepage: true,
          },
        });

        // Define logic for each homepage section
        const typeConfig = {
          general: {
            limit: settings.numberOfProductsOnHomepage,
            where: {},
            orderBy: { id: "desc" }, // default sorting
          },
          featured: {
            limit: settings.numberOfFeaturedProductsOnHomepage,
            where: { isFeatured: true },
            orderBy: { id: "desc" },
          },
          offers: {
            limit: settings.numberOfLatestOffersOnHomepage,
            where: { offer: { not: null } },
            orderBy: { id: "desc" },
          },
          new: {
            limit: settings.numberOfNewArrivalsOnHomepage,
            where: {},
            orderBy: { createdAt: "desc" },
          },
        };

        // Pick config
        const config = typeConfig[type] || typeConfig.general;

        // Apply config
        data.take = config.limit || 3;
        data.orderBy = config.orderBy;

        // Merge homepage filters into query
        data.where = {
          ...data.where,
          ...config.where,
        };
      }

      const totalProducts = await prisma.product.count({ where: data.where });
      const totalPages = Math.ceil(totalProducts / (parseInt(data.take) || 10));

      const products = await prisma.product.findMany(data);
      const formattedProducts = parseProductsImages(products);

      res.status(200).json({
        products: formattedProducts,
        totalProducts,
        totalPages,
      });
    } catch (error) {
      console.error(error.message);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  .delete(authorization(), async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin.role !== "admin")
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      const resultValidation = deleteProductsSchema(lang).safeParse(req.body);
      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            field: issue.path[0],
            message: issue.message,
          })),
        });
      }

      const data = resultValidation.data;

      // Define deletion strategies for products
      const deletionStrategies = {
        inactive: {
          action: () =>
            prisma.product.deleteMany({ where: { isActive: false } }),
          message: "deleted_all_inactive_products",
        },
        outOfStock: {
          action: () => prisma.product.deleteMany({ where: { stock: 0 } }),
          message: "deleted_all_out_of_stock_products",
        },
        lowStock: {
          action: () =>
            prisma.product.deleteMany({
              where: {
                stock: {
                  lte: prisma.product.fields.minStock,
                },
              },
            }),
          message: "deleted_all_low_stock_products",
        },
        ids: {
          action: () => {
            if (data.archived) {
              return prisma.product.updateMany({
                where: { id: { in: data.ids } },
                data: { isActive: false },
              });
            } else {
              return prisma.product.deleteMany({
                where: { id: { in: data.ids } },
              });
            }
          },
          message: () =>
            data.archived ? "archived_products" : "deleted_products",
        },
      };

      // Find and execute the appropriate strategy
      const strategy = Object.keys(deletionStrategies).find((key) => data[key]);

      if (!strategy) {
        return res.status(400).json({
          message: getTranslation(lang, "invalid_delete_operation"),
        });
      }

      await deletionStrategies[strategy].action();

      const messageKey =
        typeof deletionStrategies[strategy].message === "function"
          ? deletionStrategies[strategy].message()
          : deletionStrategies[strategy].message;

      res.status(200).json({
        message: getTranslation(lang, messageKey),
      });
      await revalidateDashboard("products");
    } catch (error) {
      console.error(error.message);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
