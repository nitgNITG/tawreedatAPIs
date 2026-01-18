import { z } from "zod";
import getTranslation from "../middleware/getTranslation.js";

const attributeValueSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  enum: z.array(z.union([z.string(), z.number()])).optional(),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const attributesSchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      try {
        return JSON.parse(val);
      } catch {
        return {};
      }
    }
    return val;
  },
  z.record(z.string(), attributeValueSchema),
);

export const categorySchema = (lang) => {
  return z
    .object({
      name: z.string({ message: getTranslation(lang, "category_name") }),

      name_ar: z
        .string({ message: getTranslation(lang, "category_name_ar") })
        .optional(),

      description: z.string().optional(),
      description_ar: z.string().optional(),

      synonyms: z
        .string()
        .max(191, getTranslation(lang, "synonyms_too_long"))
        .optional(), // ✅ NEW

      parent_id: z
        .union([z.string().transform((v) => Number.parseInt(v)), z.number()])
        .nullable()
        .optional(),

      is_active: z
        .union([
          z.string().transform((val) => val === "true" || val === "1"),
          z.boolean(),
        ])
        .optional(),

      // allow manual soft delete updates if you want
      deleted_at: z
        .union([z.string().transform((s) => new Date(s)), z.date()])
        .nullable()
        .optional(),

      deleteImage: z
        .union([
          z.string().transform((val) => val === "true" || val === "1"),
          z.boolean(),
        ])
        .optional(),

      product_attributes: attributesSchema.optional(),
    })
    .refine((data) => {
      data.slug = data.name.toLowerCase().trim().replaceAll(/\s+/g, "-");
      return true;
    });
};
