import { z } from "zod";
import getTranslation from "../../middleware/getTranslation.js";

const onBoardingSchema = (lang) => {
  return z.object({
    title: z.string({
      required_error: getTranslation(lang, "onBoarding_title_required"),
      invalid_type_error: getTranslation(lang, "onBoarding_title_required"),
    }),

    title_ar: z.string().optional(),
    subtitle: z.string().optional(),
    subtitle_ar: z.string().optional(),
    content: z.string().optional(),
    content_ar: z.string().optional(),

    // optional; usually set from upload
    sort_id: z
      .number({ invalid_type_error: getTranslation(lang, "invalidNumber") })
      .int()
      .optional()
      .default(0),
    deleted_at: z
      .union([
        z.string().transform((s) => new Date(s)), // transform string to Date
        z.date(), // accept actual Date objects
      ])
      .nullable()
      .optional(),
  });
};

export default onBoardingSchema;
