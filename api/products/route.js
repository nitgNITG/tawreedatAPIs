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

const generateSKU = async (categoryId, productName) => {
  try {
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
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();

    let sku = `${categoryPrefix}-${namePrefix}-${timestamp}-${random}`;

    let counter = 1;
    while (await prisma.product.findUnique({ where: { sku } })) {
      sku = `${categoryPrefix}-${namePrefix}-${timestamp}-${random}-${counter}`;
      counter++;
    }

    return sku;
  } catch (error) {
    console.error("Error generating SKU:", error);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `PRD-${timestamp}-${random}`;
  }
};

const generateBarcode = async () => {
  const companyPrefix = "123";
  const productCode = Math.random().toString().slice(2, 11);

  const baseNumber = companyPrefix + productCode;
  let sum = 0;
  for (let i = 0; i < baseNumber.length; i++) {
    const digit = parseInt(baseNumber[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;

  let barcode = baseNumber + checkDigit;

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
  .post(
    authorization({ roles: ["admin"] }),
    upload.array("images", 5),
    async (req, res) => {
      const lang = langReq(req);

      try {
        const admin = req.user;

        const query = new FeatureApi(req).fields().data;

        // ✅ category_id is string in body usually => parseInt
        const categoryId = Number.parseInt(req.body.category_id);
        if (Number.isNaN(categoryId)) {
          return res
            .status(400)
            .json({ message: getTranslation(lang, "category_required") });
        }

        const category = await prisma.category.findUnique({
          where: { id: categoryId },
          select: { product_attributes: true },
        });

        if (!category) {
          return res
            .status(400)
            .json({ message: getTranslation(lang, "category_not_found") });
        }

        const resultValidation = productSchema(
          lang,
          category.product_attributes,
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

        // ✅ SKU/Barcode generation uses snake_case
        if (!data.sku)
          data.sku = await generateSKU(data.category_id, data.name);
        if (!data.barcode) data.barcode = await generateBarcode();

        // Uniqueness checks
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

        if (data.barcode) {
          const existingBarcode = await prisma.product.findUnique({
            where: { barcode: data.barcode },
          });
          if (existingBarcode) {
            return res
              .status(400)
              .json({
                message: getTranslation(lang, "barcode_already_exists"),
              });
          }
        }

        // Images upload
        const imageUrls = [];
        if (req.files?.length) {
          for (const file of req.files) {
            const imageUrl = await uploadImage(file, "/products");
            imageUrls.push(imageUrl);
          }
        }

        data.images = imageUrls.length ? JSON.stringify(imageUrls) : null;

        // ✅ create with snake_case data
        const product = await prisma.product.create({
          data,
          ...(query ?? []),
        });

        const formattedProduct = parseProductImages(product);

        res.status(201).json({
          message: getTranslation(lang, "product_created_successfully"),
          product: formattedProduct,
        });

        await revalidateDashboard("products");

        await updateBrandUpTo(data.brand_id);

        // ✅ brandCategory join uses snake_case too (and brand_id can be null)
        if (data.brand_id) {
          await prisma.brandCategory.upsert({
            where: {
              brand_id_category_id: {
                brand_id: data.brand_id,
                category_id: data.category_id,
              },
            },
            update: {},
            create: {
              brand_id: data.brand_id,
              category_id: data.category_id,
            },
          });
        }

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
      const { homePage, type, ...query } = req.query;
      const tempReq = { ...req, query };

      const data = new FeatureApi(tempReq)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit(10)
        .keyword(
          ["name", "name_ar", "sku", "barcode", "slug", "synonyms"],
          "OR",
        ).data;

      if (homePage) {
        const settings = await prisma.applicationSettings.findFirst({
          select: {
            numberOfProductsOnHomepage: true,
            numberOfFeaturedProductsOnHomepage: true,
            numberOfLatestOffersOnHomepage: true,
            numberOfNewArrivalsOnHomepage: true,
          },
        });

        const typeConfig = {
          general: {
            limit: settings?.numberOfProductsOnHomepage,
            where: {},
            orderBy: { created_at: "desc" },
          },
          featured: {
            limit: settings?.numberOfFeaturedProductsOnHomepage,
            where: { is_featured: true },
            orderBy: { created_at: "desc" },
          },
          offers: {
            limit: settings?.numberOfLatestOffersOnHomepage,
            where: { offer: { not: null } },
            orderBy: { created_at: "desc" },
          },
          new: {
            limit: settings?.numberOfNewArrivalsOnHomepage,
            where: {},
            orderBy: { created_at: "desc" },
          },
        };

        const config = typeConfig[type] || typeConfig.general;

        data.take = config.limit || 3;
        data.orderBy = config.orderBy;
        data.where = { ...data.where, ...config.where };
      }

      const totalProducts = await prisma.product.count({ where: data.where });
      const totalPages = Math.ceil(
        totalProducts / (Number.parseInt(data.take, 10) || 10),
      );

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
  .delete(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);

    try {
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

      const deletionStrategies = {
        inactive: {
          action: () =>
            prisma.product.deleteMany({ where: { is_active: false } }),
          message: "deleted_all_inactive_products",
        },
        outOfStock: {
          action: () => prisma.product.deleteMany({ where: { stock: 0 } }),
          message: "deleted_all_out_of_stock_products",
        },
        lowStock: {
          action: () =>
            prisma.product.deleteMany({
              where: { stock: { lte: prisma.product.fields.min_stock } },
            }),
          message: "deleted_all_low_stock_products",
        },
        ids: {
          action: () => {
            if (data.archived) {
              return prisma.product.updateMany({
                where: { id: { in: data.ids } },
                data: { is_active: false, deleted_at: new Date() },
              });
            }
            return prisma.product.deleteMany({
              where: { id: { in: data.ids } },
            });
          },
          message: () =>
            data.archived ? "archived_products" : "deleted_products",
        },
      };

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

      res.status(200).json({ message: getTranslation(lang, messageKey) });
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
