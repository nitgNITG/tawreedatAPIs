import express from "express";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import {
  getOrderOrThrow,
  assertOrderRefundable,
  getRefundedQtyMap,
  validateRefundItems,
  buildRefundItems,
  calculateRefundAmount,
} from "../../services/refund/refund.service.js";
import refundRequestSchema from "../../schemas/refund.schema.js";
import processPaymobRefund from "../../services/refund/paymob.refund.js";

const router = express.Router();
// admin refund route

router.post("/", authorization, async (req, res) => {
  const lang = langReq(req);
  const user = req.user;

  if (user.role !== "ADMIN")
    return res.status(403).json({ message: getTranslation(lang, "forbidden") });

  try {
    const validation = refundRequestSchema(lang).safeParse(req.body);
    if (!validation.success)
      return res.status(422).json({
        message: getTranslation(lang, "validationError"),
      });

    const { orderId, items = [], reason } = validation.data;

    const order = await getOrderOrThrow(orderId);
    assertOrderRefundable(order);

    const refundedQtyMap = await getRefundedQtyMap(order.id);
    if (items.length) validateRefundItems({ order, items, refundedQtyMap });

    const refundItems = buildRefundItems({ order, items, refundedQtyMap });
    const amount = calculateRefundAmount(refundItems);

    let paymentAttempt = null;
    if (order.paymentMethod === "CREDIT_CARD") {
      try {
        const paymobResult = await processPaymobRefund({
          transactionId: order.paymentId,
          amount,
        });

        // 2️⃣ SUCCESS
        paymentAttempt = await prisma.paymentAttempt.create({
          data: {
            orderId: order.id,
            provider: "PAYMOB",
            intentionId: order.paymentId,
            status:
              amount >= order.totalAmount ? "REFUNDED" : "PARTIALLY_REFUNDED",
            rawResponse: paymobResult.rawResponse,
          },
        });
      } catch (err) {
        console.log("failed", err);
        // 3️⃣ FAILED
        paymentAttempt = await prisma.paymentAttempt.create({
          data: {
            orderId: order.id,
            provider: "PAYMOB",
            intentionId: order.paymentId,
            status: "FAILED",
            rawResponse: err.meta || { message: err.message },
          },
        });

        throw err;
      }
    }

    // 4️⃣ Business transaction
    const refund = await prisma.$transaction(async (tx) => {
      const created = await tx.refund.create({
        data: {
          orderId,
          amount,
          reason,
          status: "COMPLETED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          items:
            amount >= order.totalAmount ? undefined : { create: refundItems },
          provider: order.paymentMethod === "CREDIT_CARD" ? "PAYMOB" : "N/A",
          paymentAttemptId: paymentAttempt ? paymentAttempt.id : null,
        },
        include: { items: true },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus:
            amount >= order.totalAmount ? "REFUNDED" : "PARTIALLY_REFUNDED",
          refundedAmount: amount,
        },
      });

      return created;
    });

    res.status(201).json({
      refund,
      message: getTranslation(lang, "refundCompleted"),
    });
  } catch (err) {
    console.log(err);

    const status = err.statusCode || 500;
    res.status(status).json({
      message: getTranslation(lang, err.message || "internalError"),
    });
  }
});

export default router;
