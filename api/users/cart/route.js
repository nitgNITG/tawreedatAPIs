import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import { z } from "zod";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { parseProductImages } from "../../../utils/productImages.js";
import { ensureCustomerCart } from "../../../utils/checkUserExists.js";

const router = express.Router();

// ---- validation ----
const cartItemCreateSchema = (lang) =>
  z.object({
    unit_id: z
      .union([z.string().transform((v) => Number.parseInt(v, 10)), z.number()])
      .refine((v) => Number.isInteger(v) && v > 0, {
        message: getTranslation(lang, "unit_id_required"),
      }),
    quantity: z
      .union([z.string().transform((v) => Number.parseInt(v, 10)), z.number()])
      .refine((v) => Number.isInteger(v) && v > 0, {
        message: getTranslation(lang, "quantity_must_be_positive"),
      }),
  });

const cartItemUpdateSchema = (lang) =>
  z.object({
    unit_id: z
      .union([z.string().transform((v) => Number.parseInt(v, 10)), z.number()])
      .refine((v) => Number.isInteger(v) && v > 0, {
        message: getTranslation(lang, "unit_id_required"),
      }),
    action: z.enum(["increment", "decrement", "set"], {
      message: getTranslation(lang, "invalid_action"),
    }),
    quantity: z
      .union([z.string().transform((v) => Number.parseInt(v, 10)), z.number()])
      .refine((v) => Number.isInteger(v) && v >= 0, {
        message: getTranslation(lang, "quantity_must_be_positive"),
      }),
  });

// ----------------------
// GET /cart-items
// ----------------------
router
  .route("/")
  .get(authorization(), async (req, res) => {
    const lang = langReq(req);

    try {
      const userId = req.user.id;

      const customerCart = await ensureCustomerCart(lang, userId);
      if (!customerCart.ok) {
        return res
          .status(customerCart.status)
          .json({ message: customerCart.message });
      }

      const cart_id = customerCart.cart.id;

      // Use FeatureApi but ensure we include product + unit (important)
      const data = new FeatureApi(req)
        .fields("id,cart_id,quantity,product=id-name-name_ar-images,unit")
        .filter({ cart_id })
        .sort().data;

      // If FeatureApi didn't include relations, force include for correct response
      const cartItems = await prisma.cartItem.findMany(data);

      const formattedCartItems = cartItems.map((item) => {
        const product = parseProductImages(item.product);
        const unitPrice = Number(item.unit?.price ?? 0);

        return {
          ...item,
          product,
          unit: item.unit,
          unit_price: unitPrice,
          line_total: unitPrice * item.quantity,
        };
      });

      const cartSummary = {
        itemCount: formattedCartItems.length,
        totalItems: formattedCartItems.reduce(
          (sum, it) => sum + it.quantity,
          0,
        ),
        totalPrice: formattedCartItems.reduce(
          (sum, it) => sum + it.line_total,
          0,
        ),
      };

      return res.status(200).json({
        message: getTranslation(lang, "success"),
        cartItems: formattedCartItems,
        cartSummary,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  // ----------------------
  // POST /cart-items
  // body: { unit_id, quantity }
  // (If exists => increment)
  // ----------------------
  .post(authorization(), async (req, res) => {
    const lang = langReq(req);

    try {
      const userId = req.user.id;
      const validation = cartItemCreateSchema(lang).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0].message,
          errors: validation.error.issues,
        });
      }

      const { unit_id, quantity } = validation.data;

      const customerCart = await ensureCustomerCart(lang, userId);
      if (!customerCart.ok) {
        return res
          .status(customerCart.status)
          .json({ message: customerCart.message });
      }

      const cart_id = customerCart.cart.id;

      const result = await prisma.$transaction(async (tx) => {
        // ✅ unit must exist and connect to product (and product must be active + not deleted)
        const unit = await tx.productUnit.findUnique({
          where: { id: unit_id },
          select: {
            id: true,
            price: true,
            product: {
              select: {
                id: true,
                stock: true,
                is_active: true,
                deleted_at: true,
              },
            },
          },
        });

        if (
          !unit ||
          !unit.product ||
          unit.product.is_active !== true ||
          unit.product.deleted_at !== null
        ) {
          throw new Error("UNIT_NOT_FOUND");
        }

        if (unit.product.stock <= 0) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        // ✅ Upsert: create new or increment existing
        // - create quantity is clamped immediately
        // - update uses increment (atomic) then we clamp if exceeded stock
        let cartItem = await tx.cartItem.upsert({
          where: { cart_id_unit_id: { cart_id, unit_id } },
          create: {
            cart_id,
            unit_id,
            product_id: unit.product.id,
            quantity: Math.min(quantity, unit.product.stock),
          },
          update: {
            product_id: unit.product.id,
            quantity: { increment: quantity },
          },
          include: { product: true, unit: true },
        });

        // ✅ clamp to stock after increment
        let hasWarning = false;
        if (cartItem.quantity > unit.product.stock) {
          hasWarning = true;
          cartItem = await tx.cartItem.update({
            where: { id: cartItem.id },
            data: { quantity: unit.product.stock },
            include: { product: true, unit: true },
          });
        }

        // ✅ update cart total_price (stored)
        const items = await tx.cartItem.findMany({
          where: { cart_id },
          include: { unit: true },
        });

        const total = items.reduce(
          (sum, it) => sum + Number(it.unit?.price ?? 0) * it.quantity,
          0,
        );

        await tx.cart.update({
          where: { id: cart_id },
          data: { total_price: total },
        });

        return { cartItem, hasWarning };
      });

      const formattedCartItem = {
        ...result.cartItem,
        product: parseProductImages(result.cartItem.product),
        unit_price: Number(result.cartItem.unit?.price ?? 0),
        line_total:
          Number(result.cartItem.unit?.price ?? 0) * result.cartItem.quantity,
      };

      const response = {
        message: getTranslation(lang, "cart_item_added"),
        cartItem: formattedCartItem,
      };

      if (result.hasWarning) {
        response.warning = getTranslation(lang, "quantity_adjusted_to_stock");
      }

      return res.status(201).json(response);
    } catch (error) {
      if (error.message === "UNIT_NOT_FOUND") {
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
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  // ----------------------
  // PUT /cart-items
  // body: { unit_id, action, quantity }
  // ----------------------
  .put(authorization(), async (req, res) => {
    const lang = langReq(req);

    try {
      const userId = req.user.id;

      const validation = cartItemUpdateSchema(lang).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0].message,
          errors: validation.error.issues,
        });
      }

      const { unit_id, action, quantity } = validation.data;

      const customerCart = await ensureCustomerCart(lang, userId);
      if (!customerCart.ok) {
        return res
          .status(customerCart.status)
          .json({ message: customerCart.message });
      }

      const cartId = customerCart.cart.id;

      const result = await prisma.$transaction(async (tx) => {
        const existing = await tx.cartItem.findUnique({
          where: { cart_id_unit_id: { cart_id: cartId, unit_id } },
          select: { id: true, quantity: true, product_id: true },
        });

        if (!existing) throw new Error("CART_ITEM_NOT_FOUND");

        // we need stock if increment/set
        let stock = null;
        if (action === "increment" || action === "set") {
          const unit = await tx.productUnit.findUnique({
            where: { id: unit_id },
            select: {
              product: {
                select: { stock: true, is_active: true, deleted_at: true },
              },
            },
          });

          if (
            !unit ||
            !unit.product ||
            unit.product.is_active !== true ||
            unit.product.deleted_at !== null
          ) {
            throw new Error("UNIT_NOT_FOUND");
          }

          stock = unit.product.stock;
          if (stock <= 0) throw new Error("INSUFFICIENT_STOCK");
        }

        let newQuantity = existing.quantity;

        if (action === "increment") newQuantity = existing.quantity + quantity;
        if (action === "decrement") newQuantity = existing.quantity - quantity;
        if (action === "set") newQuantity = quantity;

        // delete if <= 0
        if (newQuantity <= 0) {
          await tx.cartItem.delete({ where: { id: existing.id } });

          // update cart total
          const items = await tx.cartItem.findMany({
            where: { cart_id: cartId },
            include: { unit: true },
          });

          const total = items.reduce(
            (sum, it) => sum + Number(it.unit?.price ?? 0) * it.quantity,
            0,
          );

          await tx.cart.update({
            where: { id: cartId },
            data: { total_price: total },
          });

          return { deleted: true };
        }

        // enforce stock limit
        if ((action === "increment" || action === "set") && stock != null) {
          newQuantity = Math.min(newQuantity, stock);
        }

        const updated = await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: newQuantity },
          include: { product: true, unit: true },
        });

        // update cart total
        const items = await tx.cartItem.findMany({
          where: { cart_id: cartId },
          include: { unit: true },
        });

        const total = items.reduce(
          (sum, it) => sum + Number(it.unit?.price ?? 0) * it.quantity,
          0,
        );

        await tx.cart.update({
          where: { id: cartId },
          data: { total_price: total },
        });

        return { cartItem: updated };
      });

      if (result.deleted) {
        return res.status(200).json({
          message: getTranslation(lang, "cart_item_removed"),
        });
      }

      const formattedCartItem = {
        ...result.cartItem,
        product: parseProductImages(result.cartItem.product),
        unit_price: Number(result.cartItem.unit?.price ?? 0),
        line_total:
          Number(result.cartItem.unit?.price ?? 0) * result.cartItem.quantity,
      };

      return res.status(200).json({
        message: getTranslation(lang, "cart_item_updated"),
        cartItem: formattedCartItem,
      });
    } catch (error) {
      if (error.message === "CART_ITEM_NOT_FOUND") {
        return res.status(404).json({
          message: getTranslation(lang, "cart_item_not_found"),
        });
      }

      if (error.message === "UNIT_NOT_FOUND") {
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
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  // ----------------------
  // DELETE /cart-items  (clear cart)
  // ----------------------
  .delete(authorization(), async (req, res) => {
    const lang = langReq(req);

    try {
      const userId = req.user.id;

      const customerCart = await ensureCustomerCart(lang, userId);
      if (!customerCart.ok) {
        return res
          .status(customerCart.status)
          .json({ message: customerCart.message });
      }

      const cart_id = customerCart.cart.id;

      await prisma.$transaction(async (tx) => {
        await tx.cartItem.deleteMany({ where: { cart_id } });
        await tx.cart.update({
          where: { id: cart_id },
          data: { total_price: 0 },
        });
      });

      return res.status(200).json({
        message: getTranslation(lang, "cart_cleared"),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
