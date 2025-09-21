import { z } from "zod";
import getTranslation from "../middleware/getTranslation.js";

export const createBrandSchema = (lang) => {
  return z
    .object({
      name: z.string().min(1, getTranslation(lang, "name_required")),
      nameAr: z.string().optional(),
      isActive: z
        .union([z.boolean(), z.string().transform((val) => val === "true")])
        .optional(),
      isDeleted: z
        .union([z.boolean(), z.string().transform((val) => val === "true")])
        .optional(),
      isPopular: z
        .union([z.boolean(), z.string().transform((val) => val === "true")])
        .optional(),
      products: z
        .union([
          z.array(z.number()),
          z
            .string()
            .transform((val) => (JSON.parse(val) < 0 ? [] : JSON.parse(val))),
        ])
        .optional(),
      categories: z
        .union([
          z.array(z.number()),
          z
            .string()
            .transform((val) => (JSON.parse(val) < 0 ? [] : JSON.parse(val))),
        ])
        .optional(),
    })
    .refine((data) => {
      data.slug = data.name.toLowerCase().replace(/\s+/g, "-");
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
