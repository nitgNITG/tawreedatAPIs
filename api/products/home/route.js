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
        where: { parentId: null },
        select: {
          id: true,
          name: true,
          nameAr: true,
          iconUrl: true,
          imageUrl: true,
          description: true,
          descriptionAr: true,
        },
        orderBy: { id: "asc" }, // Optional: Ensure consistent category order
      }),
    ]);

    // Handle case where settings might be null (first run app)
    const limits = {
      general: settings?.numberOfProductsOnHomepage || 10,
      featured: settings?.numberOfFeaturedProductsOnHomepage || 10,
      offers: settings?.numberOfLatestOffersOnHomepage || 10,
      new: settings?.numberOfNewArrivalsOnHomepage || 10,
    };

    // 3. Hydrate Categories with Products
    // We use Promise.all to process all categories in parallel
    const data = await Promise.all(
      categories.map(async (category) => {
        // Helper function to generate the query configuration
        const getQuery = (type) => {
          const baseWhere = {
            OR: [
              { categoryId: category.id },
              {
                category: {
                  parentId: category.id,
                },
              },
            ],
          }; // Filter by THIS category

          switch (type) {
            case "featured":
              return {
                where: { ...baseWhere, isFeatured: true },
                take: limits.featured,
                orderBy: { id: "desc" },
                select,
              };
            case "new":
              return {
                where: { ...baseWhere },
                take: limits.new,
                orderBy: { createdAt: "desc" },
                select,
              };
            case "offers":
              return {
                // Assuming 'offer' is a relation or nullable field based on your snippet
                where: { ...baseWhere, offer: { not: null } },
                take: limits.offers,
                orderBy: { id: "desc" },
                select,
              };
            case "general":
            default:
              return {
                where: { ...baseWhere },
                take: limits.general,
                orderBy: { id: "desc" },
                select,
              };
          }
        };

        // Execute queries conditionally
        // We run these in parallel for the specific category
        const [featured, newProducts, latestOffers, general] =
          await Promise.all([
            showFeatured ? prisma.product.findMany(getQuery("featured")) : [],
            showNew ? prisma.product.findMany(getQuery("new")) : [],
            showOffers ? prisma.product.findMany(getQuery("offers")) : [],
            showGeneral ? prisma.product.findMany(getQuery("general")) : [],
          ]);

        // Return the structured object
        return {
          ...category,
          featured: parseProductsImages(featured),
          new: parseProductsImages(newProducts),
          latestOffers: parseProductsImages(latestOffers),
          general: parseProductsImages(general),
        };
      })
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
