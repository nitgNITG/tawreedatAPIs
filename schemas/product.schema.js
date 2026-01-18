import { z } from "zod";
import getTranslation from "../middleware/getTranslation.js";

export function buildZodSchema(rules) {
  if (!rules || typeof rules !== "object") return z.object({}).passthrough();

  const shape = {};

  for (const [key, rule] of Object.entries(rules)) {
    if (!rule || !rule.type) continue;

    let validator;

    switch (rule.type.toLowerCase()) {
      case "string":
        validator = z.string().transform((val) => String(val));
        break;
      case "number":
        validator = z.union([
          z.string().transform((val) => {
            const num = Number.parseFloat(val);
            return Number.isNaN(num) ? undefined : num;
          }),
          z.number(),
        ]);
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

    if (rule.enum && Array.isArray(rule.enum) && rule.enum.length > 0) {
      validator = validator.refine(
        (val) => rule.enum.some((item) => String(item) === String(val)),
        { message: `${key} must be one of: ${rule.enum.join(", ")}` },
      );
    }

    if (rule.required !== true) validator = validator.optional();
    if (rule.default !== undefined) validator = validator.default(rule.default);

    shape[key] = validator;
  }

  return z.object(shape);
}

// helpers
const toInt = (v) => (typeof v === "string" ? Number.parseInt(v) : v);
const toFloat = (v) => (typeof v === "string" ? Number.parseFloat(v) : v);
const toDecimal = (v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    return Number.isNaN(n) ? undefined : n; // Prisma Decimal accepts number/string
  }
  return v; // number
};

export const productSchema = (
  lang,
  categoryAttributes = null,
  productId = null,
) => {
  const baseSchema = z
    .object({
      // core
      name: z
        .string({ message: getTranslation(lang, "name_required") })
        .min(1, { message: getTranslation(lang, "name_required") })
        .max(100, { message: getTranslation(lang, "name_too_long") }),

      name_ar: z
        .string()
        .min(1, { message: getTranslation(lang, "name_required_ar") })
        .max(100, { message: getTranslation(lang, "name_too_long_ar") })
        .optional(),

      description: z
        .string()
        .max(1000, { message: getTranslation(lang, "description_too_long") })
        .optional(),

      description_ar: z
        .string()
        .max(1000, { message: getTranslation(lang, "description_too_long_ar") })
        .optional(),

      synonyms: z.string().max(191).optional(),

      // ✅ add slug so it won't be stripped
      slug: z.string().max(191).optional(),

      price: z
        .union([z.string().transform(toFloat), z.number()])
        .refine((val) => !Number.isNaN(val) && val >= 0, {
          message: getTranslation(lang, "price_required"),
        }),

      offer: z
        .union([z.string().transform(toFloat), z.number()])
        .refine((val) => !Number.isNaN(val) && val >= 0, {
          message: getTranslation(lang, "offer_min"),
        })
        .optional(),

      offer_valid_from: z
        .union([z.string().transform((el) => new Date(el)), z.date()], {
          message: getTranslation(lang, "invalid_offerValidFrom"),
        })
        .optional(),

      offer_valid_to: z
        .union([z.string().transform((el) => new Date(el)), z.date()], {
          message: getTranslation(lang, "invalid_offerValidTo"),
        })
        .optional(),

      cost_price: z
        .union([z.string().transform(toFloat), z.number()])
        .refine(
          (val) => val === undefined || (!Number.isNaN(val) && val >= 0),
          {
            message: getTranslation(lang, "cost_price_min"),
          },
        )
        .optional(),

      stock: z
        .union([z.string().transform(toInt), z.number()])
        .refine(
          (val) => val === undefined || (!Number.isNaN(val) && val >= 0),
          {
            message: getTranslation(lang, "stock_min"),
          },
        )
        .optional(),

      min_stock: z
        .union([z.string().transform(toInt), z.number()])
        .refine(
          (val) => val === undefined || (!Number.isNaN(val) && val >= 0),
          {
            message: getTranslation(lang, "min_stock_min"),
          },
        )
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

      // image ops (keep same naming used by route)
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
        .union([z.string().transform(toFloat), z.number()])
        .refine(
          (val) => val === undefined || (!Number.isNaN(val) && val >= 0),
          {
            message: getTranslation(lang, "weight_invalid"),
          },
        )
        .optional(),

      dimensions: z
        .string()
        .max(100, { message: getTranslation(lang, "dimensions_too_long") })
        .optional(),

      is_active: z
        .union([
          z.string().transform((val) => val === "true" || val === "1"),
          z.boolean(),
        ])
        .optional(),

      is_featured: z
        .union([
          z.string().transform((val) => val === "true" || val === "1"),
          z.boolean(),
        ])
        .optional(),

      is_best_seller: z
        .union([
          z.string().transform((val) => val === "true" || val === "1"),
          z.boolean(),
        ])
        .optional(),

      sort_id: z.union([z.string().transform(toInt), z.number()]).optional(),

      category_id: z
        .union([z.string().transform(toInt), z.number()])
        .refine((val) => !Number.isNaN(val) && val > 0, {
          message: getTranslation(lang, "category_required"),
        }),

      brand_id: z
        .union([z.string().transform(toInt), z.number()])
        .refine((val) => !Number.isNaN(val) && val > 0, {
          message: getTranslation(lang, "brand_required"),
        }),

      supplier_id: z.string().optional(),

      deleted_at: z
        .union([z.string().transform((s) => new Date(s)), z.date()])
        .nullable()
        .optional(),

      // ✅ NEW FIELDS (as in model)
      unit_type: z.union([z.string().transform(toInt), z.number()]).optional(),
      color: z.string().max(191).optional(),

      // decimals (Prisma Decimal accepts string/number)
      min_discount_rate: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      min_amount_for_one_user: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      max_amount_for_one_user: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      min_amount_for_one_order: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      max_amount_for_one_order: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),

      refundable: z
        .union([
          z.string().transform((val) => val === "true" || val === "1"),
          z.boolean(),
        ])
        .optional(),

      refundable_period: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      refund_policy: z.string().optional(),
      price_out_site: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),

      discount_type: z.enum(["percent", "fixed"]).optional(),

      discount_value_total: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      discount_value_part_for_customer: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      discount_value_part_for_company: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      discount_value_part_for_offers: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),

      available_amount: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      reserved_in_carts_amount: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),
      ordered_amount: z
        .union([z.string().transform(toDecimal), z.number()])
        .optional(),

      // dynamic attributes (same as your logic) — keep as-is
      attributes: z
        .union([
          z.array(z.object({ key: z.string(), value: z.string().max(100) })),
          z.string().transform((val) => {
            try {
              return JSON.parse(val || "[]");
            } catch {
              return [];
            }
          }),
        ])
        .transform((attributes, ctx) => {
          if (!categoryAttributes || !attributes || attributes.length === 0)
            return;

          try {
            const attributeRules =
              typeof categoryAttributes === "string"
                ? JSON.parse(categoryAttributes)
                : categoryAttributes;

            const attributesObject = {};
            for (const attr of attributes)
              attributesObject[attr.key] = attr.value;

            const dynamicSchema = buildZodSchema(attributeRules);
            const result = dynamicSchema.safeParse(attributesObject);
            if (!result.success) {
              result.error.issues.forEach((issue) => {
                ctx.addIssue({
                  code: issue.code,
                  path: ["attributes", issue.path[0]],
                  message: issue.message,
                });
              });
              return;
            }

            // IMPORTANT: update unique key name to match your prisma schema
            // If you renamed unique to @@unique([key, product_id]) then it becomes key_product_id
            if (productId) {
              return {
                upsert: Object.entries(result.data).map(([key, value]) => ({
                  where: { key_product_id: { product_id: productId, key } },
                  update: { value: String(value) },
                  create: { key, value: String(value) },
                })),
              };
            }

            return {
              create: Object.entries(result.data).map(([key, value]) => ({
                key,
                value: String(value),
              })),
            };
          } catch (error) {
            ctx.addIssue({
              code: "custom",
              path: ["attributes"],
              message: getTranslation(
                lang,
                "invalid_product_attributes_format",
              ),
            });
            throw error;
          }
        })
        .optional(),

      deleteAttributes: z
        .union([
          z.string().transform((val) => JSON.parse(val)),
          z.array(z.number()),
        ])
        .optional(),
    })
    // ✅ FIXED refinements to new keys
    .refine(
      ({ offer, offer_valid_from, offer_valid_to }) => {
        if (offer != null) return !!offer_valid_from && !!offer_valid_to;
        return true;
      },
      {
        message: getTranslation(lang, "offer_dates_required"),
        path: ["offer_valid_from"],
      },
    )
    .refine(
      ({ offer_valid_from, offer_valid_to }) => {
        if (offer_valid_from && offer_valid_to)
          return offer_valid_to > offer_valid_from;
        return true;
      },
      {
        message: getTranslation(lang, "offer_end_date_must_be_after_start"),
        path: ["offer_valid_to"],
      },
    )
    // ✅ slug generation that actually stays in output
    .transform((data) => ({
      ...data,
      slug: data.slug ?? data.name.toLowerCase().trim().replace(/\s+/g, "-"),
    }));

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
