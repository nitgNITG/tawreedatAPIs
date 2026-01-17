import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import { z } from "zod";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { parseProductImages } from "../../../utils/productImages.js";

const router = express.Router();

// Cart item schema for validation
const cartItemCreateSchema = (lang) => {
  return z.object({
    productId: z
      .string({ message: getTranslation(lang, "product_id_required") })
      .min(1, { message: getTranslation(lang, "product_id_required") }),
    quantity: z
      .union([z.string().transform((val) => Number.parseInt(val)), z.number()])
      .refine((val) => !Number.isNaN(val) && val > 0, {
        message: getTranslation(lang, "quantity_must_be_positive"),
      }),
  });
};

const cartItemUpdateSchema = (lang) => {
  return z.object({
    quantity: z
      .union([z.string().transform((val) => Number.parseInt(val)), z.number()])
      .refine((val) => !Number.isNaN(val) && val > 0, {
        message: getTranslation(lang, "quantity_must_be_positive"),
      }),
  });
};

router
  .route("/")
  .get(authorization(), async (req, res) => {
    const lang = langReq(req);
    try {
      const userId = req.user.id;
      const data = new FeatureApi(req)
        .fields(
          "id,quantity,createdAt,product=id-name-price-images-offer-offerValidFrom-offerValidTo"
        )
        .filter({ userId })
        .sort().data;

      const cartItems = await prisma.cartItem.findMany(data);

      let formattedCartItems = cartItems;
      if (data.select?.product) {
        // 1. Process images AND determine the final price for each item
        formattedCartItems = formattedCartItems.map((item) => {
          const productWithImages = parseProductImages(item.product);

          let currentPrice = productWithImages.price; // Default to base price

          // Check if offer exists and dates are valid
          if (
            productWithImages.offer &&
            productWithImages.offerValidFrom &&
            productWithImages.offerValidTo
          ) {
            const now = new Date();
            const validFrom = new Date(productWithImages.offerValidFrom);
            const validTo = new Date(productWithImages.offerValidTo);

            // Check if the current date is within the valid range
            if (now >= validFrom && now <= validTo) {
              // Offer is valid, calculate the discounted price
              const discountAmount =
                (productWithImages.price * productWithImages.offer) / 100;
              currentPrice = productWithImages.price - discountAmount;
              // Ensure price is positive
              if (currentPrice < 0) currentPrice = 0;
            }
          }

          // Return the item with the final calculated price added as a new property
          // The original price remains available inside item.product.price
          return {
            ...item,
            finalPrice: currentPrice,
            product: productWithImages,
            // Add a specific field to the cart item response for the price used in total calculations
          };
        });
      }

      // Calculate cart totals
      let cartSummary = {
        totalItems: formattedCartItems.reduce(
          (sum, item) => sum + item.quantity,
          0
        ),
        itemCount: formattedCartItems.length,
        totalPrice: 0, // Initialize total price
      };

      if (formattedCartItems.length > 0) {
        // 2. Use the new 'finalPrice' field for accurate total calculation
        cartSummary.totalPrice = formattedCartItems.reduce(
          (sum, item) =>
            sum + (item.finalPrice ?? item?.product.price) * item.quantity,
          0
        );
      }

      res.status(200).json({
        message: getTranslation(lang, "success"),
        cartItems: formattedCartItems,
        cartSummary,
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
      const resultValidation = cartItemCreateSchema(lang).safeParse(req.body);

      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        });
      }

      const { productId, quantity } = resultValidation.data;

      // Check if item already exists in cart
      const existingCartItem = await prisma.cartItem.findUnique({
        where: { userId_productId: { userId, productId } },
      });

      if (existingCartItem) {
        return res.status(409).json({
          message: getTranslation(lang, "product_already_in_cart"),
          suggestion: getTranslation(lang, "use_put_to_update"),
        });
      }

      // Validate product and stock in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: productId, isActive: true },
          select: { stock: true },
        });

        if (!product) {
          throw new Error("PRODUCT_NOT_FOUND");
        }

        if (product.stock === 0) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        const finalQuantity = Math.min(quantity, product.stock);
        const hasWarning = finalQuantity < quantity;

        const cartItem = await tx.cartItem.create({
          data: { userId, productId, quantity: finalQuantity },
          ...(query ?? []),
        });

        return { cartItem, hasWarning };
      });

      let formattedCartItem = result.cartItem;
      if (result.cartItem.product) {
        formattedCartItem = {
          ...result.cartItem,
          product: parseProductImages(result.cartItem.product),
        };
      }

      const response = {
        message: getTranslation(lang, "cart_item_added"),
        cartItem: formattedCartItem,
      };

      if (result.hasWarning) {
        response.warning = getTranslation(lang, "quantity_adjusted_to_stock");
      }

      res.status(201).json(response);
    } catch (error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        return res.status(404).json({
          message: getTranslation(lang, "product_not_found"),
        });
      }

      if (error.message === "INSUFFICIENT_STOCK") {
        return res.status(400).json({
          message: getTranslation(lang, "insufficient_stock"),
        });
      }

      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(authorization(), async (req, res) => {
    const lang = langReq(req);
    try {
      const userId = req.user.id;
      const query = new FeatureApi(req).fields().data;
      const resultValidation = z
        .object({
          productId: z
            .string({ message: getTranslation(lang, "product_id_required") })
            .min(1, { message: getTranslation(lang, "product_id_required") }),
          action: z.enum(["increment", "decrement", "set"], {
            message: getTranslation(lang, "invalid_action"),
          }),
          quantity: z
            .union([
              z.string().transform((val) => Number.parseInt(val)),
              z.number(),
            ])
            .refine((val) => !Number.isNaN(val) && val >= 0, {
              message: getTranslation(lang, "quantity_must_be_positive"),
            }),
        })
        .safeParse(req.body);

      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        });
      }

      const { productId, action, quantity } = resultValidation.data;

      const result = await prisma.$transaction(async (tx) => {
        // Check if cart item exists
        const existingItem = await tx.cartItem.findUnique({
          where: { userId_productId: { userId, productId } },
          select: { id: true, quantity: true },
        });

        if (!existingItem) {
          throw new Error("CART_ITEM_NOT_FOUND");
        }

        // Check product stock for increment/set operations
        let product = null;
        if (action === "increment" || action === "set") {
          product = await tx.product.findUnique({
            where: { id: productId, isActive: true },
            select: { stock: true },
          });

          if (!product) {
            throw new Error("PRODUCT_NOT_FOUND");
          }

          if (product.stock === 0) {
            throw new Error("INSUFFICIENT_STOCK");
          }
        }

        let newQuantity;
        switch (action) {
          case "increment":
            newQuantity = existingItem.quantity + quantity;
            break;
          case "decrement":
            newQuantity = existingItem.quantity - quantity;
            break;
          case "set":
            newQuantity = quantity;
            break;
        }

        // Handle quantity limits
        if (newQuantity <= 0) {
          await tx.cartItem.delete({ where: { id: existingItem.id } });
          return { deleted: true };
        }

        // Check stock limit for increment/set operations
        if ((action === "increment" || action === "set") && product) {
          newQuantity = Math.min(newQuantity, product.stock);
        }

        const updatedItem = await tx.cartItem.update({
          where: { id: existingItem.id },
          data: { quantity: newQuantity },
          ...(query ?? []),
        });

        return { cartItem: updatedItem };
      });

      if (result.deleted) {
        return res.status(200).json({
          message: getTranslation(lang, "cart_item_removed"),
        });
      }

      let formattedCartItem = result.cartItem;
      if (result.cartItem.product) {
        formattedCartItem = {
          ...result.cartItem,
          product: parseProductImages(result.cartItem.product),
        };
      }

      res.status(200).json({
        message: getTranslation(lang, "cart_item_updated"),
        cartItem: formattedCartItem,
      });
    } catch (error) {
      if (error.message === "CART_ITEM_NOT_FOUND") {
        return res.status(404).json({
          message: getTranslation(lang, "cart_item_not_found"),
        });
      }

      if (error.message === "PRODUCT_NOT_FOUND") {
        return res.status(404).json({
          message: getTranslation(lang, "product_not_found"),
        });
      }

      if (error.message === "INSUFFICIENT_STOCK") {
        return res.status(400).json({
          message: getTranslation(lang, "insufficient_stock"),
        });
      }

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

      await prisma.cartItem.deleteMany({
        where: { userId },
      });

      res.status(200).json({
        message: getTranslation(lang, "cart_cleared"),
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
