import { z } from "zod";
import getTranslation from "../middleware/getTranslation.js";

export const customerAddressSchema = (lang) => {
  const toNumber = (v) =>
    v === undefined || v === null || v === "" ? v : Number(v);

  return z.object({
    name: z.string({
      required_error: getTranslation(lang, "address_name_required"),
    }),
    address: z.string().optional(), // in model it's nullable
    city: z.string().optional(),
    area_id: z.string().optional(),
    country: z.string().optional(),
    postal_code: z.string().optional(),
    notes: z.string().optional(),
    is_default: z
      .union([z.boolean(), z.string().transform((s) => s === "true")])
      .optional(),

    apartment_number: z.string().optional(),
    building_number: z.string().optional(),
    floor_number: z.string().optional(),

    recipient_name: z.string().optional(),
    recipient_phone: z.string().optional(),

    // Store as numbers; Prisma Decimal accepts number/string.
    latitude: z
      .preprocess(toNumber, z.number().min(-90).max(90))
      .optional()
      .nullable(),

    longitude: z
      .preprocess(toNumber, z.number().min(-180).max(180))
      .optional()
      .nullable(),
  });
};
