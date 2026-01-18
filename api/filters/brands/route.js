import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const lang = langReq(req);

  try {
    const baseBrandFilter = {
      is_deleted: false,
      is_active: true,
    };

    const ranges = [
      { label: "Below 10%", value: "below-10", where: { up_to: { lt: 10 } } },
      {
        label: "10% - 20%",
        value: "10-20",
        where: { up_to: { gte: 10, lte: 20 } },
      },
      {
        label: "20% - 30%",
        value: "20-30",
        where: { up_to: { gte: 20, lte: 30 } },
      },
      { label: "Above 30%", value: "above-30", where: { up_to: { gt: 30 } } },
    ];

    const transactionQueries = [
      prisma.category.findMany({
        where: { parent_id: null },
        select: {
          id: true,
          name: true,
          name_ar: true,
          image_url: true,
          icon_url: true,
        },
      }),

      ...ranges.map((r) =>
        prisma.brand.count({
          where: {
            ...baseBrandFilter,
            ...r.where,
          },
        }),
      ),
    ];

    const results = await prisma.$transaction(transactionQueries);

    const categories = results[0];
    const counts = results.slice(1);

    const up_toRanges = ranges.map((range, idx) => ({
      ...range,
      count: counts[idx],
    }));

    return res.status(200).json({ categories, up_toRanges });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
