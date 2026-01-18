import { z } from "zod";
import getTranslation from "../middleware/getTranslation.js";

export const createBrandSchema = (lang) => {
  return z
    .object({
      name: z.string().min(1, getTranslation(lang, "name_required")),
      name_ar: z.string().optional(),
      description: z.string().optional(),
      description_ar: z.string().optional(),

      synonyms: z
        .string()
        .max(191, getTranslation(lang, "synonyms_too_long"))
        .optional(), // ✅ NEW

      is_active: z
        .union([z.boolean(), z.string().transform((val) => val === "true")])
        .optional(),

      deleted_at: z
        .union([
          z.string().transform((s) => new Date(s)), // transform string to Date
          z.date(), // accept actual Date objects
        ])
        .nullable()
        .optional(),

      is_popular: z
        .union([z.boolean(), z.string().transform((val) => val === "true")])
        .optional(),

      products: z
        .union([
          z.array(z.number()),
          z.string().transform((val) => {
            try {
              const parsed = val ? JSON.parse(val) : [];
              return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              console.warn("Failed to parse products JSON:", e.message);
              return [];
            }
          }),
        ])
        .optional(),

      categories: z
        .union([
          z.array(z.number()),
          z.string().transform((val) => {
            try {
              const parsed = val ? JSON.parse(val) : [];
              return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              console.warn("Failed to parse categories JSON:", e.message);
              return [];
            }
          }),
        ])
        .optional(),
    })
    .refine((data) => {
      data.slug = data.name.toLowerCase().trim().replaceAll(/\s+/g, "-");
      return true;
    });
};

export const updateBrandSchema = (lang) =>
  createBrandSchema(lang)
    .safeExtend({
      deleteCoverUrl: z
        .union([z.boolean(), z.string().transform((val) => val === "true")])
        .optional(),
      deleteLogoUrl: z
        .union([z.boolean(), z.string().transform((val) => val === "true")])
        .optional(),
    })
    .partial();

export const deleteBrandsSchema = (lang) => {
  return z.union([
    z.object({
      isDeleted: z.boolean(),
    }),
    z.object({
      notActive: z.boolean(),
    }),
    z.object({
      ids: z
        .array(z.number(), {
          message: getTranslation(lang, "invalid_brand_ids"),
        })
        .min(1, { message: getTranslation(lang, "invalid_brand_ids") }),
      permanent: z.boolean().optional(),
    }),
  ]);
};
