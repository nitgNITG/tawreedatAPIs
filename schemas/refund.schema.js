import { z } from "zod";
import getTranslation from "../middleware/getTranslation.js";

// Validation schema for creating a refund request
const refundRequestSchema = (lang) =>
  z.object({
    orderId: z.number({ message: getTranslation(lang, "invalidOrderId") }),
    items: z
      .array(
        z.object({
          orderItemId: z.number({
            message: getTranslation(lang, "invalidOrderItem"),
          }),
          quantity: z
            .number({ message: getTranslation(lang, "invalidQuantity") })
            .min(1),
        })
      )
      .optional(), // optional
    reason: z
      .string()
      .min(3, { message: getTranslation(lang, "refundReasonMinLength") })
      .optional(),
  });

export default refundRequestSchema;
