import { z } from "zod";
import getTranslation from "../middleware/getTranslation.js";

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
  const baseSchema = z
    .object({
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
      offerValidFrom: z
        .union([z.string().transform((el) => new Date(el)), z.date()], {
          message: getTranslation(lang, "invalid_offerValidFrom"),
        })
        .optional(),
      offerValidTo: z
        .union([z.string().transform((el) => new Date(el)), z.date()], {
          message: getTranslation(lang, "invalid_offerValidTo"),
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
      deleteSpecificImages: z
        .union([z.string(), z.array(z.string())])
        .optional(),
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
              message: getTranslation(
                lang,
                "invalid_product_attributes_format"
              ),
            });
            throw error; // Rethrow the error to ensure proper exception handling
          }
        })
        .optional(),
      deleteAttributes: z
        .union([z.string().transform((val) => JSON.parse(val)), z.number()])
        .optional(),
    })
    .refine(
      ({ offer, offerValidFrom, offerValidTo }) => {
        if (offer) {
          return offerValidFrom && offerValidTo;
        }
        return true;
      },
      {
        message: getTranslation(lang, "offer_dates_required"),
        path: ["offerValidFrom"],
      }
    )
    // 2. Check: ValidTo must be > ValidFrom
    .refine(
      ({ offerValidFrom, offerValidTo }) => {
        if (offerValidFrom && offerValidTo) {
          return offerValidTo > offerValidFrom;
        }
        return true;
      },
      {
        message: getTranslation(lang, "offer_end_date_must_be_after_start"),
        path: ["offerValidTo"],
      }
    );

  return baseSchema;
};

export const deleteProductsSchema = (lang) => {
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
