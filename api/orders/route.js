import express from "express";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import { z } from "zod";
import pushNotification from "../../utils/push-notification.js";

const orderCreateSchema = z.object({
  paymentMethod: z
    .enum(["CREDIT_CARD", "PAYPAL", "BANK_TRANSFER", "CASH_ON_DELIVERY"])
    .default("CASH_ON_DELIVERY"),
  userAddressId: z.number({
    required_error: "userAddressId is required",
  }),
  notes: z.string().optional(),
});
// Utility to generate a unique order number
async function generateUniqueOrderNumber(userId, prisma) {
  const date = new Date().toISOString().split("T")[0].replaceAll("-", "");
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
        .keyword(["customer.fullname", "orderNumber"], "OR").data;

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
                offer: true,
              },
            },
            quantity: true,
          },
        });

        if (!cartItems.length) throw new Error("Cart is empty");

        // Step 2: Calculate totals
        let subtotal = 0;
        const orderItemsToCreate = cartItems.map((item) => {
          const { product, quantity } = item;

          // 1. Stock Check
          if (product.stock < quantity) {
            throw new Error(`Insufficient stock for product ${product.id}`);
          }

          // 2. Price Calculation (considering offer)
          const unitPrice = product.offer
            ? product.price * (1 - product.offer / 100)
            : product.price;

          subtotal += unitPrice * quantity;

          // 3. Return the formatted data for the 'create' step
          return {
            productId: product.id,
            quantity: quantity,
            price: unitPrice, // Store the price the customer actually paid
          };
        });

        const shippingCost = 50; // Or custom logic
        const discount = 0;
        const taxAmount = subtotal * 0.1;
        const totalAmount = subtotal;
        // TODO: const totalAmount = subtotal + shippingCost + taxAmount - discount;

        // Fetch user address
        const userAddress = await tx.userAddress.findFirst({
          where: {
            id: data.userAddressId,
            userId: user.id,
          },
        });

        if (!userAddress) {
          throw new Error(getTranslation(lang, "address_not_found"));
        }

        const shippingAddress = {
          name: userAddress.name,
          address: userAddress.address,
          city: userAddress.city,
          state: userAddress.state,
          country: userAddress.country,
          postalCode: userAddress.postalCode,
          lat: userAddress.lat,
          long: userAddress.long,
          notes: userAddress.notes,
          buildingNo: userAddress.buildingNo,
          floorNo: userAddress.floorNo,
          apartmentNo: userAddress.apartmentNo,
        };

        // Step 4: Create order
        const newOrder = await tx.order.create({
          data: {
            orderNumber,
            customerId: user.id,
            totalAmount,
            shippingCost,
            discount,
            taxAmount,
            shippingAddress,
            ...data,
            items: {
              create: orderItemsToCreate,
            },
          },
          ...(query.select || {
            include: {
              items: {
                select: {
                  price: true,
                  quantity: true,
                  product: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          }),
        });
        // // 5️ ONLY non-card → finalize now
        // if (data.paymentMethod === "CASH_ON_DELIVERY") {
        await finalizeOrder(tx, user.id, cartItems);
        // }

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

export const finalizeOrder = async (tx, userId, cartItems) => {
  for (const item of cartItems) {
    await tx.product.update({
      where: { id: item?.product?.id || item?.productId },
      data: { stock: { decrement: item.quantity } },
    });
  }

  await tx.cartItem.deleteMany({
    where: { userId },
  });
};

export default router;
