import express from "express";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import { z } from "zod";
import pushNotification from "../../utils/push-notification.js";

const orderCreateSchema = z.object({
  paymentMethod: z.string().optional(),
  shippingAddress: z.string().optional(),
  notes: z.string().optional(),
});
// Utility to generate a unique order number
async function generateUniqueOrderNumber(userId, prisma) {
  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const shortId = userId.slice(0, 6).toUpperCase();
  let orderNumber;
  let exists = true;
  while (exists) {
    const random = Math.floor(1000 + Math.random() * 9000); // 4-digit random
    orderNumber = `ORD-${date}-${shortId}-${random}`;
    exists = await prisma.order.findUnique({ where: { orderNumber } });
  }
  return orderNumber;
}

const router = express.Router();

router
  .route("/")
  .get(authorization, async (req, res) => {
    const lang = langReq(req);
    const user = req.user;
    try {
      if (user.role !== "ADMIN")
        return res
          .status(403)
          .json({ message: getTranslation(lang, "forbidden") });

      const data = new FeatureApi(req)
        .filter()
        .fields()
        .sort()
        .skip()
        .limit(10)
        .keyword(["customer.name"], "OR").data;

      const orders = await prisma.order.findMany(data);
      const totalCount = await prisma.order.count({ where: data.where });
      const totalPages = Math.ceil(totalCount / +data.take);

      return res.status(200).json({
        orders,
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
  })
  .post(authorization, async (req, res) => {
    const lang = langReq(req);
    const user = req.user;
    const resultValidation = orderCreateSchema.safeParse(req.body);
    if (!resultValidation.success) {
      return res.status(422).json({
        message:
          getTranslation(lang, "validationError") +
          " " +
          resultValidation.error.issues[0].message,
        errors: resultValidation.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    try {
      const data = resultValidation.data;
      const orderNumber = await generateUniqueOrderNumber(user.id, prisma);
      const query = new FeatureApi(req).fields().data;

      const order = await prisma.$transaction(async (tx) => {
        // Step 1: Get cart items
        const cartItems = await tx.cartItem.findMany({
          where: { userId: user.id },
          select: {
            product: {
              select: {
                id: true,
                price: true,
                stock: true,
              },
            },
            quantity: true,
          },
        });

        if (cartItems.length === 0) {
          throw new Error("Cart is empty");
        }

        // Step 2: Calculate totals
        let subtotal = 0;
        cartItems.forEach((item) => {
          subtotal += item.quantity * item.product.price;
        });

        const shippingCost = 50; // Or custom logic
        const discount = 0;
        const taxAmount = subtotal * 0.1;
        const totalAmount = subtotal + shippingCost + taxAmount - discount;

        // Step 3: Check stock availability
        for (const item of cartItems) {
          if (item.product.stock < item.quantity) {
            throw new Error(`Not enough stock for product ${item.product.id}`);
          }
        }

        // Step 4: Create order
        const newOrder = await tx.order.create({
          data: {
            orderNumber,
            customerId: user.id,
            totalAmount,
            shippingCost,
            discount,
            taxAmount,
            ...data,
            items: {
              create: cartItems.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
                price: item.product.price,
              })),
            },
          },
          ...(query || { include: { items: true } }),
        });
        // Step 5: Decrease product stock
        for (const item of cartItems) {
          await tx.product.update({
            where: { id: item.product.id },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });
        }

        // Step 6: Clear cart
        await tx.cartItem.deleteMany({
          where: { userId: user.id },
        });

        return newOrder;
      });
      if (!order) {
        return res
          .status(400)
          .json({ message: getTranslation(lang, "orderCreationFailed") });
      }
      res.status(201).json({ order, message: getTranslation(lang, "created") });
      // for the user
      await pushNotification({
        key: {
          title: "notification_order_created_title_user",
          desc: "notification_order_created_desc_user",
        },
        args: {
          title: [],
          desc: [order.totalAmount],
        },
        lang,
        users: [user],
        sendToAdmins: false,
        data: {
          navigate: "orders",
          route: `/${lang}/orders?id=${order.id}`,
        },
      });
      // for admins
      await pushNotification({
        key: {
          title: "notification_order_created_title",
          desc: "notification_order_created_desc",
        },
        args: {
          title: [],
          desc: [user.fullname, order.totalAmount],
        },
        lang,
        users: [],
        data: {
          navigate: "orders",
          route: `/${lang}/orders?id=${order.id}`,
        },
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
