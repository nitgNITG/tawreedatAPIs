import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const lang = langReq(req);

  try {
    const baseBrandFilter = {
      isDeleted: false,
      isActive: true,
    };

    const ranges = [
      { label: "Below 10%", value: "below-10", where: { upTo: { lt: 10 } } },
      {
        label: "10% - 20%",
        value: "10-20",
        where: { upTo: { gte: 10, lte: 20 } },
      },
      {
        label: "20% - 30%",
        value: "20-30",
        where: { upTo: { gte: 20, lte: 30 } },
      },
      { label: "Above 30%", value: "above-30", where: { upTo: { gt: 30 } } },
    ];

    const transactionQueries = [
      prisma.category.findMany({
        where: { parentId: null },
        select: {
          id: true,
          name: true,
          nameAr: true,
          imageUrl: true,
          iconUrl: true,
        },
      }),

      ...ranges.map((r) =>
        prisma.brand.count({
          where: {
            ...baseBrandFilter,
            ...r.where,
          },
        })
      ),
    ];

    const results = await prisma.$transaction(transactionQueries);

    const categories = results[0];
    const counts = results.slice(1);

    const upToRanges = ranges.map((range, idx) => ({
      ...range,
      count: counts[idx],
    }));

    return res.status(200).json({ categories, upToRanges });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
