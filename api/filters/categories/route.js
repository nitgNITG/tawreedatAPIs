import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();

function getRangeWhere(categoryId, field, min, max) {
  return {
    categoryId,
    isActive: true,
    [field]: max === null ? { gte: min } : { gte: min, lte: max },
  };
}
const PRICE_RANGES = [
  { min: 0, max: 100 },
  { min: 100, max: 300 },
  { min: 300, max: 600 },
  { min: 600, max: 1000 },
  { min: 1000, max: null }, // 1000+
];

const WEIGHT_RANGES = [
  { min: 0, max: 1 },
  { min: 1, max: 3 },
  { min: 3, max: 5 },
  { min: 5, max: null }, // 5kg+
];

router.get("/:id", async (req, res) => {
  const lang = langReq(req);
  const categoryId = Number(req.params.id);

  if (!categoryId || isNaN(categoryId)) {
    return res.status(400).json({
      message: getTranslation(lang, "invalidCategoryId"),
    });
  }

  try {
    const [brands, attributes] = await prisma.$transaction([
      // Brands
      prisma.brandCategory.findMany({
        where: { categoryId },
        select: {
          brand: {
            select: {
              id: true,
              name: true,
              nameAr: true,
              logoUrl: true,
            },
          },
        },
      }),

      // Attributes (color, size, etc.)
      prisma.productAttribute.findMany({
        where: {
          product: {
            categoryId,
            isActive: true,
          },
        },
        select: {
          key: true,
          value: true,
          valueAr: true,
        },
      }),
    ]);

    // Group attributes
    const grouped = attributes.reduce((acc, attr) => {
      if (!acc[attr.key]) acc[attr.key] = [];
      if (!acc[attr.key].some((v) => v.value === attr.value)) {
        acc[attr.key].push({
          value: attr.value,
          valueAr: attr.valueAr,
        });
      }
      return acc;
    }, {});

    // Count products per price range
    const priceRanges = await Promise.all(
      PRICE_RANGES.map(async (r) => {
        const count = await prisma.product.count({
          where: getRangeWhere(categoryId, "price", r.min, r.max),
        });
        return { ...r, count };
      })
    );

    // Count products per weight range
    const weightRanges = await Promise.all(
      WEIGHT_RANGES.map(async (r) => {
        const count = await prisma.product.count({
          where: getRangeWhere(categoryId, "weight", r.min, r.max),
        });
        return { ...r, count };
      })
    );

    return res.status(200).json({
      brands,
      filters: grouped,
      priceRanges,
      weightRanges,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
