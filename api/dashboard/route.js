import prisma from "../../prisma/client.js";
import express from "express";
import authorization from "../../middleware/authorization.js";

const router = express.Router();

router.get("/", authorization({ roles: ["admin"] }), async (req, res) => {
  try {
    const [
      totalUsers,
      totalCustomers,
      // totalSuppliers,
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
      prisma.customer.count(),
      // prisma.supplier.count(),
      prisma.category.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.onBoarding.count(),
      prisma.ad.count(),
      prisma.faq.count(),
      prisma.article.count(),
      prisma.brand.count(),
    ]);

    const data = {
      totalUsers,
      totalCustomers,
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
