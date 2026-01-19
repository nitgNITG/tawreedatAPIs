import getTranslation from "../middleware/getTranslation.js";
import { z } from "zod";
const applicationSettingsSchema = (lang) =>
  z.object({
    number_of_products_on_homepage: z
      .number({
        required_error: getTranslation(lang, "numberOfProductsRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(3),

    number_of_categories_on_homepage: z
      .number({
        required_error: getTranslation(lang, "numberOfCategoriesRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(3),

    number_of_featured_products_on_homepage: z
      .number({
        required_error: getTranslation(
          lang,
          "numberOfFeaturedProductsRequired",
        ),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(10),

    number_of_latest_offers_on_homepage: z
      .number({
        required_error: getTranslation(lang, "numberOfLatestOffersRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(3),

    number_of_new_arrivals_on_homepage: z
      .number({
        required_error: getTranslation(lang, "numberOfNewArrivalsRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(3),

    number_of_ads_on_homepage: z
      .number({
        required_error: getTranslation(lang, "numberOfAdsOnHomepageRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(3),

    number_of_brands_on_homepage: z
      .number({
        required_error: getTranslation(
          lang,
          "numberOfBrandsOnHomepageRequired",
        ),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(3),

    vat: z
      .number({
        required_error: getTranslation(lang, "vatRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .min(0)
      .default(5),

    // Prisma: Int? @default(20)
    login_attempt_duration_minutes: z
      .number({
        required_error: getTranslation(lang, "loginAttemptDurationRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(20)
      .optional(),

    // Prisma: Int? @default(5)
    login_attempts: z
      .number({
        required_error: getTranslation(lang, "loginAttemptsRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(5)
      .optional(),

    // Prisma: Int? @default(5)
    payment_attempts: z
      .number({
        required_error: getTranslation(lang, "paymentAttemptsRequired"),
        invalid_type_error: getTranslation(lang, "invalidNumber"),
      })
      .int()
      .min(1)
      .default(5)
      .optional(),

    login_as_guest: z.boolean().default(false),
    permanent_delete: z.boolean().default(false),

    // Prisma: String?
    app_android_url: z.string().optional(),
    app_android_version: z.string().optional(),
    app_ios_url: z.string().optional(),
    app_ios_version: z.string().optional(),

    // Prisma: String?
    paymob_api_key: z.string().optional(),
    paymob_secret_key: z.string().optional(),
    paymob_public_key: z.string().optional(),
    paymob_base_url: z.string().url().optional(),
    paymob_payment_methods: z.string().optional(),
    paymob_iframes: z.string().optional(),
  });

export default applicationSettingsSchema;
