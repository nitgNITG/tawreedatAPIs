import express from "express";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { parseProductImages } from "../../../utils/productImages.js";

const router = express.Router();

router.route("/:id/reviews").get(authorization, async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;
    const { id } = req.params;
    const isAdmin = user.role === "ADMIN";

    if (!isAdmin && user.id !== id)
      return res.status(403).json({
        message: getTranslation(lang, "forbidden"),
      });

    const data = new FeatureApi(req)
      .filter({ userId: id })
      .fields()
      .sort()
      .skip()
      .limit(10)
      .keyword(
        ["product.name", "product.sku", "product.nameAr", "comment"],
        "OR"
      ).data;

    const [reviews, totalCount] = await Promise.all([
      prisma.review.findMany(data),
      prisma.review.count({ where: data.where }),
    ]);
    const totalPages = Math.ceil(totalCount / +data.take);
    let formatReviews = reviews;    
    if (data.select?.product?.select?.images) {
      formatReviews = reviews.map((review) => ({
        ...review,
        product: parseProductImages(review?.product),
      }));
    }    
    return res.status(200).json({
      reviews: formatReviews,
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
