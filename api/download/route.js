import express from "express";
import prisma from "../../prisma/client.js";
import { z } from "zod";
import extractLanguageContent from "../../utils/extractLanguageContent.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import { handleCSVDownload } from "../../utils/download-handlers/csv-handler.js";
import {
  handlePDFDownload,
  reverseIfArabic,
} from "../../utils/download-handlers/pdf-handler.js";
import { fieldTranslations } from "../../lang/fieldTranslations.js";
import authorization from "../../middleware/authorization.js";

const router = express.Router();

const downloadSchema = z.object({
  fileType: z.enum(["csv", "pdf"]),
  model: z.string(),
});

export const validateSchema = (schema) => async (req, res, next) => {
  try {
    req.validated = await schema.parseAsync(req.body);
    next();
  } catch (error) {
    console.error("Validation error:", error);
    res.status(400).json({
      error: "Validation failed",
      details: error.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }
};

const getNestedValue = (obj, preferredLang) => {
  if (!obj) return "----";
  if (typeof obj === "string")
    return extractLanguageContent(obj, preferredLang) || obj;
  if (typeof obj !== "object") return obj;

  // Handle nested objects recursively
  const values = Object.values(obj)
    .map((val) => getNestedValue(val, preferredLang))
    .filter(Boolean);

  return values.length ? values.join(", ") : "----";
};

export const formatData = async (data, preferredLang, model, where) => {
  // Check if we need to convert points to SR for wallet history
  let srRatio = null;
  if (model === "walletHistory" && where?.type === "PAYMENT") {
    const appSettings = await prisma.applicationSettings.findFirst({
      select: { srRatio: true },
    });
    srRatio = appSettings?.srRatio || 10; // Default to 10 if not found
  }

  return data.map((item) => {
    const formattedItem = {};
    Object.entries(item).forEach(([key, value]) => {
      const formattedKey = fieldTranslations[key]?.[preferredLang] || key;
      // Convert points to SR for wallet history
      if (srRatio && (key === "point" || key === "remainingPoint")) {
        const srValue = (value / srRatio).toFixed(2);
        formattedItem[formattedKey] =
          preferredLang === "en" ? `${srValue} SR` : `${srValue} ريال`;
        return;
      }
      if (key === "paymentamount") {
        formattedItem[formattedKey] =
          preferredLang === "en" ? `${value} SR` : `${value} ريال`;
        return;
      }

      if (value instanceof Date) {
        formattedItem[formattedKey] = value.toISOString().split("T")[0];
      } else if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
          const arrayValues = value.map((item) =>
            typeof item === "object"
              ? getNestedValue(item, preferredLang)
              : item
          );
          formattedItem[formattedKey] = arrayValues.length
            ? arrayValues.join(", ")
            : "----";
        } else {
          formattedItem[formattedKey] = getNestedValue(value, preferredLang);
        }
      } else if (typeof value === "string") {
        formattedItem[formattedKey] =
          extractLanguageContent(value, preferredLang) || "----";
      } else {
        formattedItem[formattedKey] = value || "----";
      }
    });

    return formattedItem;
  });
};

export const formatTitle = async (title, where, lang) => {
  if (
    title === "walletHistory" &&
    where?.walletId &&
    where?.type === "PAYMENT"
  ) {
    const id = +where.walletId;
    const { user } = await prisma.wallet.findUnique({
      where: { id },
      select: {
        user: {
          select: {
            fullname: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return {
      title: reverseIfArabic(
        `${user.fullname} - ${fieldTranslations.orders?.[lang] || title}`
      ),
      subTitle: {
        email: user.email,
        phone: user.phone,
      },
    };
  }

  if (where?.brandId) {
    const id = +where.brandId;
    const { name } = await prisma.brand.findUnique({
      where: { id },
      select: {
        name: true,
      },
    });

    return {
      title: reverseIfArabic(
        `${name} - ${fieldTranslations[title]?.[lang] || title}`,
        lang
      ),
      subTitle: {},
    };
  }

  return {
    title: reverseIfArabic(fieldTranslations[title]?.[lang] || title),
    subTitle: {},
  };
};

router.post(
  "/",
  authorization,
  validateSchema(downloadSchema),
  async (req, res) => {
    try {
      const lang = req.query.lang || "ar";
      const user = req.user;
      if (
        !user &&
        (user?.role != "admin" || user?.role != "brand representative")
      )
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      const { fileType, model } = req.validated;
      if (!prisma[model]) {
        console.error({ error: `Invalid model: ${model}` });
        return res.status(400).json({ error: `Invalid model: ${model}` });
      }
      const apiFeatures = new FeatureApi(req)
        .filter()
        .fields()
        .sort()
        .skip()
        .limit()
        .keyword(["phone"], "OR").data;
      const data = await prisma[model].findMany(apiFeatures);

      if (!data.length) {
        console.error(
          "No data found for model:",
          model,
          "with criteria:",
          apiFeatures.where
        );
        return res
          .status(404)
          .json({ error: "No data found matching the criteria" });
      }

      const formattedData = await formatData(
        data,
        lang,
        model,
        apiFeatures.where
      );

      const { title, subTitle } = await formatTitle(
        model,
        apiFeatures.where,
        lang
      );

      if (fileType === "csv") {
        return handleCSVDownload(formattedData, model, lang, res);
      }

      if (fileType === "pdf") {
        return handlePDFDownload(
          formattedData,
          model,
          title,
          subTitle,
          lang,
          res
        );
      }
    } catch (error) {
      console.error("Download error:", error);
      res
        .status(500)
        .json({ error: "Failed to generate download", details: error.message });
    }
  }
);

export default router;
