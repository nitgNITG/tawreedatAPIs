import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import { parseProductsImages } from "../../../utils/productImages.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();

router.route("/").get(async (req, res) => {
  const lang = langReq(req);

  try {
    // 1. Parse Boolean Query Parameters
    const showFeatured = req.query.featured === "true";
    const showNew = req.query.new === "true";
    const showOffers = req.query.offers === "true";
    const showGeneral = req.query.general === "true";

    const { select } = new FeatureApi(req).fields().data;

    // 2. Fetch Settings and Parent Categories
    const [settings, categories] = await Promise.all([
      prisma.applicationSettings.findFirst({
        select: {
          numberOfProductsOnHomepage: true,
          numberOfFeaturedProductsOnHomepage: true,
          numberOfLatestOffersOnHomepage: true,
          numberOfNewArrivalsOnHomepage: true,
        },
      }),
      prisma.category.findMany({
        where: { parent_id: null },
        select: {
          id: true,
          name: true,
          name_ar: true,
          icon_url: true,
          image_url: true,
          description: true,
          description_ar: true,
        },
        orderBy: { id: "asc" },
      }),
    ]);

    const limits = {
      general: settings?.numberOfProductsOnHomepage || 10,
      featured: settings?.numberOfFeaturedProductsOnHomepage || 10,
      offers: settings?.numberOfLatestOffersOnHomepage || 10,
      new: settings?.numberOfNewArrivalsOnHomepage || 10,
    };

    const now = new Date();

    // 3) Hydrate Categories with Products
    const data = await Promise.all(
      categories.map(async (category) => {
        const baseWhere = {
          deleted_at: null,
          is_active: true,
          OR: [
            { category_id: category.id },
            {
              category: {
                parent_id: category.id,
              },
            },
          ],
        };

        const getQuery = (type) => {
          switch (type) {
            case "featured":
              return {
                where: { ...baseWhere, is_featured: true },
                take: limits.featured,
                orderBy: { created_at: "desc" },
                select,
              };

            case "new":
              return {
                where: { ...baseWhere },
                take: limits.new,
                orderBy: { created_at: "desc" },
                select,
              };

            case "offers":
              return {
                where: {
                  ...baseWhere,
                  offer: { not: null, gt: 0 },
                  // ✅ OPTIONAL: only show currently valid offers
                  OR: [
                    // if no dates exist, still allow (remove this block if you require dates)
                    { offer_valid_from: null, offer_valid_to: null },
                    {
                      offer_valid_from: { lte: now },
                      offer_valid_to: { gte: now },
                    },
                  ],
                },
                take: limits.offers,
                orderBy: { offer: "desc" },
                select,
              };

            case "general":
            default:
              return {
                where: { ...baseWhere },
                take: limits.general,
                orderBy: { created_at: "desc" },
                select,
              };
          }
        };

        const [featured, newProducts, latestOffers, general] =
          await Promise.all([
            showFeatured ? prisma.product.findMany(getQuery("featured")) : [],
            showNew ? prisma.product.findMany(getQuery("new")) : [],
            showOffers ? prisma.product.findMany(getQuery("offers")) : [],
            showGeneral ? prisma.product.findMany(getQuery("general")) : [],
          ]);

        return {
          ...category,
          featured: parseProductsImages(featured),
          new: parseProductsImages(newProducts),
          latestOffers: parseProductsImages(latestOffers),
          general: parseProductsImages(general),
        };
      }),
    );

    res.status(200).json({ data, limits });
  } catch (error) {
    console.error("Home API Error:", error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
