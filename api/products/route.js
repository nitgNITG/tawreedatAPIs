import express from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import prisma from "../../prisma/client.js";
import { z } from "zod";
import authorization from "../../middleware/authorization.js";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";
import {
  parseProductImages,
  parseProductsImages,
} from "../../utils/productImages.js";
import pushNotification from "../../utils/push-notification.js";

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

export function buildZodSchema(rules) {
  if (!rules || typeof rules !== "object") {
    return z.object({}).passthrough(); // Return an empty schema that accepts anything if no rules
  }

  const shape = {};

  // console.log(rules);

  for (const [key, rule] of Object.entries(rules)) {
    // Skip if rule is not properly defined
    if (!rule || !rule.type) continue;
    // console.log("key:", key);
    // console.log("rule:", rule);

    let validator;

    // Create base validator based on type
    switch (rule.type.toLowerCase()) {
      case "string":
        validator = z
          .string()
          .transform((val) => String(val)) // Ensure string type
          .refine((val) => val !== undefined, {
            message: `${key} is required`,
          });
        break;
      case "number":
        validator = z
          .union([
            z.string().transform((val) => {
              const num = parseFloat(val);
              return isNaN(num) ? undefined : num;
            }),
            z.number(),
          ])
          .refine((val) => val !== undefined, {
            message: `${key} must be a valid number`,
          });
        break;
      case "boolean":
        validator = z.union([
          z.string().transform((val) => val === "true" || val === "1"),
          z.boolean(),
        ]);
        break;
      default:
        validator = z.any();
    }

    // Apply enum restriction if specified
    if (rule.enum && Array.isArray(rule.enum) && rule.enum.length > 0) {
      validator = validator.refine(
        (val) => rule.enum.some((item) => String(item) === String(val)),
        {
          message: `${key} must be one of: ${rule.enum.join(", ")}`,
        }
      );
    }

    // Make field optional unless required is true
    if (rule.required !== true) {
      validator = validator.optional();
    }

    if (rule.default) {
      validator = validator.default(rule.default);
    }

    // Add to schema shape
    shape[key] = validator;
  }

  // Create the schema with all validators
  return z.object(shape);
}

export const productSchema = (
  lang,
  categoryAttributes = null,
  productId = null
) => {
  // Base product schema
  const baseSchema = z.object({
    name: z
      .string({ message: getTranslation(lang, "name_required") })
      .min(1, { message: getTranslation(lang, "name_required") })
      .max(100, { message: getTranslation(lang, "name_too_long") }),
    nameAr: z
      .string()
      .min(1, { message: getTranslation(lang, "name_required_ar") })
      .max(100, { message: getTranslation(lang, "name_too_long_ar") })
      .optional(),
    description: z
      .string()
      .max(1000, { message: getTranslation(lang, "description_too_long") })
      .optional(),
    descriptionAr: z
      .string()
      .max(1000, { message: getTranslation(lang, "description_too_long_ar") })
      .optional(),
    price: z
      .union([z.string().transform((val) => parseFloat(val)), z.number()])
      .refine((val) => !isNaN(val) && val >= 0, {
        message: getTranslation(lang, "price_required"),
      }),
    offer: z
      .union([z.string().transform((val) => parseFloat(val)), z.number()])
      .refine((val) => !isNaN(val) && val >= 0, {
        message: getTranslation(lang, "offer_min"),
      })
      .optional(),
    costPrice: z
      .union([z.string().transform((val) => parseFloat(val)), z.number()])
      .refine((val) => !isNaN(val) && val >= 0, {
        message: getTranslation(lang, "cost_price_min"),
      })
      .optional(),
    stock: z
      .union([z.string().transform((val) => parseInt(val)), z.number()])
      .refine((val) => !isNaN(val) && val >= 0, {
        message: getTranslation(lang, "stock_min"),
      })
      .optional(),
    minStock: z
      .union([z.string().transform((val) => parseInt(val)), z.number()])
      .refine((val) => !isNaN(val) && val >= 0, {
        message: getTranslation(lang, "min_stock_min"),
      })
      .optional(),
    sku: z
      .string({ message: getTranslation(lang, "sku_required") })
      .min(1, { message: getTranslation(lang, "sku_required") })
      .max(100, { message: getTranslation(lang, "sku_too_long") })
      .optional(),
    barcode: z
      .string()
      .max(100, { message: getTranslation(lang, "barcode_too_long") })
      .optional(),
    images: z.string().optional(),
    deleteSpecificImages: z.union([z.string(), z.array(z.string())]).optional(),
    deleteAllImages: z
      .union([
        z.string().transform((val) => val === "true" || val === "1"),
        z.boolean(),
      ])
      .optional(),
    replaceImages: z
      .union([
        z.string().transform((val) => val === "true" || val === "1"),
        z.boolean(),
      ])
      .optional(),
    weight: z
      .union([z.string().transform((val) => parseFloat(val)), z.number()])
      .refine((val) => !isNaN(val) && val >= 0, {
        message: getTranslation(lang, "weight_invalid"),
      })
      .optional(),
    dimensions: z
      .string()
      .max(100, { message: getTranslation(lang, "dimensions_too_long") })
      .optional(),
    isActive: z
      .union([
        z.string().transform((val) => val === "true" || val === "1"),
        z.boolean(),
      ])
      .optional(),
    isFeatured: z
      .union([
        z.string().transform((val) => val === "true" || val === "1"),
        z.boolean(),
      ])
      .optional(),
    categoryId: z
      .union([z.string().transform((val) => parseInt(val)), z.number()])
      .refine((val) => !isNaN(val) && val > 0, {
        message: getTranslation(lang, "category_required"),
      }),
    brandId: z
      .union([z.string().transform((val) => parseInt(val)), z.number()])
      .refine((val) => !isNaN(val) && val > 0, {
        message: getTranslation(lang, "brand_required"),
      }),
    supplierId: z.string().optional(),
    attributes: z
      .union([
        z.array(
          z.object({
            key: z.string(),
            value: z.string().max(100),
          })
        ),
        z.string().transform((val) => {
          try {
            console.log("Parsing attributes:", val);
            const parsed = JSON.parse(val || "[]");
            console.log("Parsed attributes:", parsed);
            return parsed;
          } catch {
            return [];
          }
        }),
      ])
      .transform((attributes, ctx) => {
        // Skip validation if no category attributes defined
        if (!categoryAttributes || !attributes || attributes.length === 0)
          return;

        try {
          // Parse the category's productAttributes if it's a string
          const attributeRules =
            typeof categoryAttributes === "string"
              ? JSON.parse(categoryAttributes)
              : categoryAttributes;

          // Convert the attributes array to an object for validation
          const attributesObject = {};
          for (const attr of attributes) {
            attributesObject[attr.key] = attr.value;
          }

          // Build dynamic schema based on category attribute rules
          const dynamicSchema = buildZodSchema(attributeRules);

          // Validate with the dynamic schema
          const result = dynamicSchema.safeParse(attributesObject);
          console.log("Validation Result:", result);

          if (!result.success) {
            // Add each validation error to the context
            result.error.issues.forEach((issue) => {
              ctx.addIssue({
                code: issue.code,
                path: ["attributes", issue.path[0]], // Properly nest the path
                message: issue.message,
              });
            });
          }
          if (productId) {
            return {
              upsert: Object.entries(result.data).map(([key, value]) => ({
                where: { key_productId: { productId, key } },
                update: { value: String(value) },
                create: { key, value: String(value) },
              })),
            };
          }
          return {
            create: Object.entries(result.data).map(([key, value]) => ({
              key,
              value: String(value), // Ensure value is a string for storage
            })),
          };
        } catch (error) {
          // Add a general error if something goes wrong
          ctx.addIssue({
            code: "custom",
            path: ["attributes"],
            message: getTranslation(lang, "invalid_product_attributes_format"),
          });
          throw error; // Rethrow the error to ensure proper exception handling
        }
      })
      .optional(),
    deleteAttributes: z
      .union([z.string().transform((val) => JSON.parse(val)), z.number()])
      .optional(),
  });

  return baseSchema;
};

const deleteProductsSchema = (lang) => {
  return z.union([
    z.object({
      inactive: z.boolean(),
    }),
    z.object({
      outOfStock: z.boolean(),
    }),
    z.object({
      lowStock: z.boolean(),
    }),
    z.object({
      ids: z
        .array(z.string(), {
          message: getTranslation(lang, "product_ids_required"),
        })
        .min(1, { message: getTranslation(lang, "product_ids_required") }),
      archived: z.boolean().optional(),
    }),
  ]);
};

const router = express.Router();
router
  .route("/")
  .post(authorization, upload.array("images", 5), async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin?.role !== "ADMIN") {
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
        ...(query ?? {}),
      });
      // Parse images to array format
      const formattedProduct = parseProductImages(product);

      res.status(201).json({
        message: getTranslation(lang, "product_created_successfully"),
        product: formattedProduct,
      });

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
      // await pushNotification({
      //   key: {
      //     title: "notification_product_created_title",
      //     desc: "notification_product_created_desc",
      //   },
      //   args: {
      //     title: [],
      //     desc: [admin.fullname, formattedProduct.name],
      //   },
      //   lang,
      //   users: [],
      //   adminUserId: admin.id,
      //   data: {
      //     navigate: "products",
      //     route: `/${lang}/products?id=${formattedProduct.id}`,
      //   },
      // });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  .get(async (req, res) => {
    const lang = langReq(req);
    try {
      const { homePage, ...query } = req.query;
      if (homePage) {
        const {
          numberOfProductsOnHomepage,
          numberOfFeaturedProductsOnHomepage,
          numberOfLatestOffersOnHomepage,
          numberOfNewArrivalsOnHomepage,
        } = await prisma.applicationSettings.findFirst({
          select: {
            numberOfProductsOnHomepage: true,
            numberOfFeaturedProductsOnHomepage: true,
            numberOfLatestOffersOnHomepage: true,
            numberOfNewArrivalsOnHomepage: true,
          },
        });
        let homePageType = numberOfProductsOnHomepage;
        if (query.isFeatured) homePageType = numberOfFeaturedProductsOnHomepage;
        if (query.createdAt === "true") {
          delete query.createdAt;
          homePageType = numberOfNewArrivalsOnHomepage;
        }
        if (query.offer) homePageType = numberOfLatestOffersOnHomepage;

        query.limit = homePageType || 3;
      }
      const tempReq = { ...req, query };
      const data = new FeatureApi(tempReq)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit(10)
        .keyword(["name", "nameAr", "sku", "barcode"], "OR").data;

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
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization, async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin.role !== "ADMIN")
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

      return res.status(200).json({
        message: getTranslation(lang, messageKey),
      });
    } catch (error) {
      console.error(error.message);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
