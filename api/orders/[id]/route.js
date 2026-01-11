import express from "express";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { z } from "zod";
import pushNotification from "../../../utils/push-notification.js";

const customerUpdateSchema = (lang) => {
  return z.object({
    shippingAddress: z
      .string({ message: getTranslation(lang, "shippingAddressString") })
      .min(3, { message: getTranslation(lang, "shippingAddressMinLength") })
      .optional(),
    notes: z
      .string({ message: getTranslation(lang, "notesString") })
      .optional(),
    status: z
      .literal("CANCELLED", { message: getTranslation(lang, "invalidStatus") })
      .optional(),
  });
};

const adminUpdateSchema = (lang) => {
  return z.object({
    shippingAddress: z
      .string({ message: getTranslation(lang, "shippingAddressString") })
      .min(3, { message: getTranslation(lang, "shippingAddressMinLength") })
      .optional(),
    notes: z
      .string({ message: getTranslation(lang, "notesString") })
      .optional(),
    status: z
      .enum(
        [
          "PENDING",
          "CONFIRMED",
          "PROCESSING",
          "SHIPPED",
          "DELIVERED",
          "CANCELLED",
        ],
        {
          message: getTranslation(lang, "invalidStatus"),
        }
      )
      .optional(),
    paymentStatus: z
      .enum(["PENDING", "PAID", "FAILED", "REFUNDED"], {
        message: getTranslation(lang, "invalidPaymentStatus"),
      })
      .optional(),
    shippingCost: z
      .number({ message: getTranslation(lang, "invalidShippingCost") })
      .nonnegative({ message: getTranslation(lang, "negativeShippingCost") })
      .optional(),
    discount: z
      .number({ message: getTranslation(lang, "invalidDiscount") })
      .min(0, { message: getTranslation(lang, "negativeDiscount") })
      .optional(),
    taxAmount: z
      .number({ message: getTranslation(lang, "invalidTaxAmount") })
      .min(0, { message: getTranslation(lang, "negativeTaxAmount") })
      .optional(),
    paymentMethod: z
      .enum(["CREDIT_CARD", "PAYPAL", "BANK_TRANSFER", "CASH_ON_DELIVERY"])
      .optional(),
    refundedAmount: z
      .number({ message: getTranslation(lang, "invalidRefundedAmount") })
      .min(0, { message: getTranslation(lang, "negativeRefundedAmount") })
      .optional(),
  });
};

const router = express.Router();

// Get a single order by ID
router.get("/:id", authorization, async (req, res) => {
  const lang = langReq(req);
  const id = req.params.id;
  const user = req.user;
  try {
    const data = new FeatureApi(req).fields().includes().data;
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: Number.isNaN(+id) ? undefined : +id }, { orderNumber: id }],
      },
      ...data,
    });
    if (!order)
      return res
        .status(404)
        .json({ message: getTranslation(lang, "notFound") });
    if (user.role !== "ADMIN" && order.customerId !== req.user.id)
      return res
        .status(403)
        .json({ message: getTranslation(lang, "forbidden") });

    return res
      .status(200)
      .json({ order, message: getTranslation(lang, "success") });
  } catch (error) {
    return res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

// Update an order
router.put("/:id", authorization, async (req, res) => {
  const lang = langReq(req);
  const id = req.params.id;
  const updates = req.body;
  const user = req.user;

  try {
    const query = new FeatureApi(req).fields().data;
    const order = await prisma.order.findFirst({
      where: {
        OR: [{ id: Number.isNaN(+id) ? undefined : +id }, { orderNumber: id }],
      },
      include: { items: true },
    });
    if (!order)
      return res
        .status(404)
        .json({ message: getTranslation(lang, "notFound") });
    const isAdmin = user.role === "ADMIN";
    const isOwner = order.customerId === user.id;
    if (!isAdmin && !isOwner)
      return res
        .status(403)
        .json({ message: getTranslation(lang, "forbidden") });
    if (!isAdmin && order.status !== "PENDING")
      return res
        .status(400)
        .json({ message: getTranslation(lang, "cannotUpdateStatus") });

    const schema = isAdmin
      ? adminUpdateSchema(lang)
      : customerUpdateSchema(lang);
    const resultValidation = schema.safeParse(updates);

    if (!resultValidation.success) {
      return res.status(422).json({
        message:
          getTranslation(lang, "validationError") +
          " " +
          resultValidation.error.issues[0].message,
        errors: resultValidation.error.issues.map((issue) => ({
          field: issue.path[0],
          message: issue.message,
        })),
      });
    }
    const data = resultValidation.data;

    const result = await prisma.$transaction(async (tx) => {
      // If cancelling, restock items (optional: only if order is not shipped/delivered)
      if (data.status === "CANCELLED" && order.status === "PENDING") {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stock: { increment: item.quantity }, // assumes `stock` exists
            },
          });
        }
      }

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data,
        ...(query || {}),
      });

      return updatedOrder;
    });
    res
      .status(200)
      .json({ order: result, message: getTranslation(lang, "updated") });

    // Notify user and admins based on update
    if (data.status === "CANCELLED") {
      // Notify user: order cancelled
      await pushNotification({
        key: {
          title: "notification_order_Cancelled_title",
          desc: "notification_order_Cancelled_desc_user",
        },
        args: {
          title: [],
          desc: [order.orderNumber],
        },
        lang,
        users: [user],
        sendToAdmins: false,
        data: {
          navigate: "orders",
          route: `/${lang}/orders?id=${order.id}`,
        },
      });
      // Notify admins: order cancelled
      await pushNotification({
        key: {
          title: "notification_order_Cancelled_title",
          desc: "notification_order_Cancelled_desc",
        },
        args: {
          title: [],
          desc: [order.orderNumber, user.fullname],
        },
        lang,
        users: [],
        adminUserId: isAdmin ? user.id : undefined,
        data: {
          navigate: "orders",
          route: `/${lang}/orders?id=${order.id}`,
        },
      });
    } else if (data.status && data.status !== order.status) {
      // Notify user: order status changed
      await pushNotification({
        key: {
          title: "notification_order_status_title",
          desc: "notification_order_status_desc_user",
        },
        args: {
          title: [data.status],
          desc: [order.orderNumber, data.status],
        },
        lang,
        users: [user],
        sendToAdmins: false,
        data: {
          navigate: "orders",
          route: `/${lang}/orders?id=${order.id}`,
        },
      });
      // Notify admins: order status changed
      await pushNotification({
        key: {
          title: "notification_order_status_title",
          desc: "notification_order_status_desc",
        },
        args: {
          title: [data.status],
          desc: [order.orderNumber, data.status],
        },
        lang,
        users: [],
        adminUserId: isAdmin ? user.id : undefined,
        data: {
          navigate: "orders",
          route: `/${lang}/orders?id=${order.id}`,
        },
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

// Delete an order
router.delete("/:id", authorization, async (req, res) => {
  const lang = langReq(req);
  const id = req.params.id;
  try {
    const order = await prisma.order.findUnique({
      where: {
        OR: [{ id: Number.isNaN(+id) ? undefined : +id }, { orderNumber: id }],
      },
    });
    if (!order)
      return res
        .status(404)
        .json({ message: getTranslation(lang, "notFound") });
    await prisma.order.delete({ where: { id: order.id } });
    res.status(200).json({ message: getTranslation(lang, "deleted") });
  } catch (error) {
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
