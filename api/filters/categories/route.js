import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";

const router = express.Router();

function getRangeWhere(category_id, field, min, max) {
  return {
    category_id,
    is_active: true,
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
  const category_id = Number(req.params.id);

  if (!category_id || Number.isNaN(category_id)) {
    return res.status(400).json({
      message: getTranslation(lang, "invalidCategoryId"),
    });
  }

  try {
    const [brands, attributes] = await prisma.$transaction([
      // Brands
      prisma.brandCategory.findMany({
        where: { category_id },
        select: {
          brand: {
            select: {
              id: true,
              name: true,
              name_ar: true,
              logo_url: true,
            },
          },
        },
      }),

      // Attributes (color, size, etc.)
      prisma.productAttribute.findMany({
        where: {
          product: {
            category_id,
            is_active: true,
          },
        },
        select: {
          key: true,
          value: true,
          value_ar: true,
        },
      }),
    ]);

    // Group attributes
    const grouped = attributes.reduce((acc, attr) => {
      if (!acc[attr.key]) acc[attr.key] = [];
      if (!acc[attr.key].some((v) => v.value === attr.value)) {
        acc[attr.key].push({
          value: attr.value,
          value_ar: attr.value_ar,
        });
      }
      return acc;
    }, {});

    // Count products per price range
    const priceRanges = await Promise.all(
      PRICE_RANGES.map(async (r) => {
        const count = await prisma.product.count({
          where: getRangeWhere(category_id, "price", r.min, r.max),
        });
        return { ...r, count };
      }),
    );

    // Count products per weight range
    const weightRanges = await Promise.all(
      WEIGHT_RANGES.map(async (r) => {
        const count = await prisma.product.count({
          where: getRangeWhere(category_id, "weight", r.min, r.max),
        });
        return { ...r, count };
      }),
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
