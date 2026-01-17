import prisma from "../../prisma/client.js";
import express from "express";
import authorization from "../../middleware/authorization.js";
import { langReq } from "../../middleware/getTranslation.js";

const router = express.Router();

router.get("/", authorization(), async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;
    if (user.role !== "admin") {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "not_allowed") });
    }
    const [
      totalUsers,
      totalCategories,
      totalProducts,
      totalOrders,
      totalOnBoarding,
      totalAds,
      totalFaqs,
      totalArticles,
      totalBrands,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.category.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.onBoarding.count(),
      prisma.ad.count(),
      prisma.faqs.count(),
      prisma.article.count(),
      prisma.brand.count(),
    ]);

    const data = {
      totalUsers,
      totalCategories,
      totalProducts,
      totalOrders,
      totalOnBoarding,
      totalAds,
      totalFaqs,
      totalArticles,
      totalBrands,
    };
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
      error: error.message,
    });
  }
});

export default router;
