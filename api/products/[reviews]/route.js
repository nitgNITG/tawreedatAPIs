import express from "express";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { da } from "zod/v4/locales";

const router = express.Router();

router.route("/:id/reviews").get(async (req, res) => {
  const lang = langReq(req);
  try {
    const productId = req.params.id;
    const data = new FeatureApi(req)
      .filter({ productId })
      .fields()
      .sort()
      .skip()
      .limit(10)
      .keyword(
        ["user.full_name", "user.email", "user.phone", "comment"],
        "OR"
      ).data;
    data.where.status = "APPROVED";

    const [reviews, totalCount] = await Promise.all([
      prisma.review.findMany(data),
      prisma.review.count({ where: data.where }),
    ]);
    const totalPages = Math.ceil(totalCount / +data.take);

    console.log(reviews);

    return res.status(200).json({
      reviews,
      totalPages,
      totalCount,
      message: getTranslation(lang, "success"),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
