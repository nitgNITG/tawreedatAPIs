import getTranslation from "../middleware/getTranslation.js";
import { z } from "zod";

export const reviewSchema = (lang, isAdmin) => {
  const baseSchema = {
    productId: z
      .string({ message: getTranslation(lang, "product_required") })
      .min(1, { message: getTranslation(lang, "product_required") }),
    rating: z
      .number({ message: getTranslation(lang, "rating_required") })
      .min(1, { message: getTranslation(lang, "rating_min") })
      .max(5, { message: getTranslation(lang, "rating_max") }),
    comment: z
      .string({ message: getTranslation(lang, "comment_required") })
      .min(1, { message: getTranslation(lang, "comment_required") })
      .optional(),
  };

  if (isAdmin) {
    baseSchema.status = z
      .enum(["PENDING", "APPROVED", "REJECTED"], {
        message: getTranslation(lang, "invalid_status"),
      })
      .optional();
  }

  return z.object(baseSchema);
};
