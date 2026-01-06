import express from "express";
import prisma from "../../../prisma/client.js";
import { langReq } from "../../../middleware/getTranslation.js";
import pushNotification from "../../../utils/push-notification.js";
import crypto from "node:crypto";
import { finalizeOrder } from "../../orders/route.js";

const router = express.Router();

function parsePaymobReference(ref) {
  if (!ref) return null;

  const [orderNumber, , attemptId] = ref.split("::");

  return {
    orderNumber,
    attemptId: Number(attemptId),
  };
}

/**
 * GET /payments/callback
 * User redirect after payment
 * Only shows HTML page to user
 */
router.get("/callback", async (req, res) => {
  const { success, id, merchant_order_id } = req.query;
  const parsedReference = parsePaymobReference(merchant_order_id);
  try {
    // 🔐 UI safety only
    const isValid = verifyPaymobGetHmac(req.query);

    if (!isValid) {
      return res.status(403).send(`
      <h1>Invalid Payment Callback</h1>
      <p>Security verification failed.</p>
    `);
    }
    if (!parsedReference) {
      return res.status(400).send(`
        <h1>Invalid Payment Callback</h1>
        <p>Missing or malformed reference.</p>
      `);
    }
    const { orderNumber } = parsedReference;

    const order = await prisma.order.findUnique({
      where: { orderNumber },
    });

    if (!order) {
      return res.status(404).send(`
        <h1>Error: Order Not Found</h1>
        <p>Order reference: ${merchant_order_id}</p>
      `);
    }

    if (success === "true") {
      res.send(`
        <h1>Payment Successful</h1>
        <p>Order Number: ${order.orderNumber}</p>
        <p>Transaction ID: ${id}</p>
        <p>Please close this window and return to your app.</p>
      `);
    } else {
      res.send(`
        <h1>Payment Failed</h1>
        <p>Order Number: ${order.orderNumber}</p>
        <p>Please try again or contact support.</p>
      `);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send(`
      <h1>Payment Processing Error</h1>
      <p>${error.message}</p>
    `);
  }
});

/**
 * POST /payments/callback
 * Webhook from Paymob
 * This is the authoritative source to finalize payment
 */
router.post("/callback", async (req, res) => {
  const lang = langReq(req);
  const hmac = req.query.hmac; // ✅ from query
  const payload = req.body; // ✅ webhook body
  const obj = payload.obj;

  try {
    if (!verifyPaymobHmac(payload, hmac)) {
      console.error("❌ Invalid Paymob HMAC");
      return res.status(400).json({ success: false });
    }
    res.sendStatus(200);

    const parsedReference = parsePaymobReference(obj?.order?.merchant_order_id);

    if (!parsedReference) {
      return res.status(400).json({ error: "Missing merchant_order_id" });
    }
    const { orderNumber } = parsedReference;

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        customer: {
          select: {
            fcmToken: true,
            lang: true,
          },
        },
        items: {
          select: {
            quantity: true,
            productId: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (obj.success === true) {
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: "PAID",
            status: "CONFIRMED",
            paymentId: obj.id.toString(),
            paymentAttempts: {
              updateMany: {
                where: {
                  orderId: order.id,
                  status: "PENDING",
                  provider: "PAYMOB",
                },
                data: {
                  intentionId: obj.id.toString(),
                  status: "PAID",
                  rawResponse: obj,
                },
              },
            },
          },
        });

        // Decrease stock and clear cart
        await finalizeOrder(tx, order.customerId, order.items);
      });

      await pushNotification({
        key: {
          title: "notification_payment_success_title_user",
          desc: "notification_payment_success_desc_user",
        },
        args: {
          title: [],
          desc: [order.totalAmount, order.orderNumber],
        },
        lang,
        users: [
          {
            id: order.customerId,
            fcmToken: order.customer.fcmToken,
            lang: order.customer.lang,
          },
        ],
        data: { navigate: "orders", route: `/${lang}/orders?id=${order.id}` },
      });

      await pushNotification({
        key: {
          title: "notification_payment_success_title_admin",
          desc: "notification_payment_success_desc_admin",
        },
        args: {
          title: [],
          desc: [order.orderNumber, order.totalAmount],
        },
        lang,
        users: [],
        data: { navigate: "orders", route: `/${lang}/orders?id=${order.id}` },
      });
    } else {
      // Payment failed
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "FAILED",
          paymentAttempts: {
            updateMany: {
              where: {
                orderId: order.id,
                status: "PENDING",
                provider: "PAYMOB",
              },
              data: {
                status: "FAILED",
                intentionId: obj.id.toString(),
                rawResponse: obj,
              },
            },
          },
        },
      });
    }
  } catch (error) {
    console.error("Error processing Paymob webhook:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const HMAC_KEYS_ORDER = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
];

export const verifyPaymobHmac = (payload, receivedHmac) => {
  if (!receivedHmac) return false;

  const obj = payload.obj;

  const data = HMAC_KEYS_ORDER.map((key) => {
    const path = key.split(".");
    let value = obj;

    for (const p of path) {
      value = value?.[p];
      if (value === undefined || value === null) return "";
    }

    return String(value);
  }).join("");

  const calculatedHmac = crypto
    .createHmac("sha512", process.env.PAYMOB_HMAC_SECRET)
    .update(data)
    .digest("hex");

  return calculatedHmac === receivedHmac;
};

const GET_HMAC_KEYS_ORDER = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order", // ✅ NOT order.id
  "owner",
  "pending",
  "source_data.pan", // ✅ FLAT KEY
  "source_data.sub_type", // ✅ FLAT KEY
  "source_data.type", // ✅ FLAT KEY
  "success",
];

export const verifyPaymobGetHmac = (query) => {
  const receivedHmac = query.hmac;
  if (!receivedHmac) return false;

  const data = GET_HMAC_KEYS_ORDER.map((key) => {
    const value = query[key];
    return value !== undefined && value !== null ? String(value) : "";
  }).join("");

  const calculatedHmac = crypto
    .createHmac("sha512", process.env.PAYMOB_HMAC_SECRET)
    .update(data)
    .digest("hex");

  return calculatedHmac === receivedHmac;
};

export default router;
