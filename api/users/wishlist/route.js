import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import { z } from "zod";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { parseProductImages } from "../../../utils/productImages.js";

const router = express.Router();

// Wishlist item schema for validation
const wishlistItemSchema = (lang) => {
  return z.object({
    productId: z
      .string({ message: getTranslation(lang, "product_id_required") })
      .min(1, { message: getTranslation(lang, "product_id_required") }),
  });
};

router
  .route("/")
  .get(authorization(), async (req, res) => {
    const lang = langReq(req);
    try {
      const userId = req.user.id;
      const data = new FeatureApi(req).fields().filter({ userId }).data;

      const wishlistItems = await prisma.wishlistItem.findMany(data);

      let formattedWishlistItems = wishlistItems;
      if (formattedWishlistItems[0]?.product) {
        formattedWishlistItems = formattedWishlistItems.map((item) => ({
          ...item,
          product: parseProductImages(item.product),
        }));
      }
      // Calculate wishlist summary
      const wishlistSummary = {
        totalItems: formattedWishlistItems.length,
      };

      res.status(200).json({
        message: getTranslation(lang, "success"),
        wishlistItems: formattedWishlistItems,
        wishlistSummary,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .post(authorization(), async (req, res) => {
    const lang = langReq(req);
    try {
      const userId = req.user.id;
      const query = new FeatureApi(req).fields().data;
      const resultValidation = wishlistItemSchema(lang).safeParse(req.body);

      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        });
      }

      const { productId } = resultValidation.data;

      // Check if product exists and is active
      const product = await prisma.product.findUnique({
        where: { id: productId, isActive: true },
        select: { id: true },
      });

      if (!product) {
        return res.status(404).json({
          message: getTranslation(lang, "product_not_found"),
        });
      }

      // Check if item already exists in wishlist
      const existingWishlistItem = await prisma.wishlistItem.findUnique({
        where: { userId_productId: { userId, productId } },
      });

      if (existingWishlistItem) {
        // if item already exists, delete it
        await prisma.wishlistItem.delete({
          where: { id: existingWishlistItem.id },
        });

        return res.status(200).json({
          message: getTranslation(lang, "product_removed_from_wishlist"),
        });
      }

      // Add item to wishlist
      const wishlistItem = await prisma.wishlistItem.create({
        data: { userId, productId },
        ...(query ?? []),
      });
      let formattedWishlistItem = wishlistItem;
      if (wishlistItem?.product) {
        formattedWishlistItem = {
          ...wishlistItem,
          product: parseProductImages(wishlistItem.product),
        };
      }

      res.status(201).json({
        message: getTranslation(lang, "product_added_to_wishlist"),
        wishlistItem: formattedWishlistItem,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization(), async (req, res) => {
    const lang = langReq(req);
    try {
      const userId = req.user.id;

      await prisma.wishlistItem.deleteMany({
        where: { userId },
      });

      res.status(200).json({
        message: getTranslation(lang, "wishlist_cleared"),
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
