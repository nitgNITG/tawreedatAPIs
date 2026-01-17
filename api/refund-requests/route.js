import express from "express";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import refundRequestSchema from "../../schemas/refund.schema.js";
import processPaymobRefund from "../../services/refund/paymob.refund.js";
import {
  assertOrderRefundable,
  buildRefundItems,
  calculateRefundAmount,
  getOrderOrThrow,
  getRefundedQtyMap,
  validateRefundItems,
} from "../../services/refund/refund.service.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import { AppError } from "../../utils/appError.js";
import pushNotification from "../../utils/push-notification.js";

const router = express.Router();

// Create a refund request
router
  .route("/")
  .post(authorization(), async (req, res) => {
    const lang = langReq(req);
    const user = req.user;

    try {
      /* 1️⃣ Validate request */
      const validation = refundRequestSchema(lang).safeParse(req.body);
      if (!validation.success) {
        throw new AppError("validationError", 422, {
          issues: validation.error.issues,
        });
      }
      const { orderId, items = [], reason } = validation.data;

      /* 2️⃣ Fetch order */
      const order = await getOrderOrThrow(orderId);

      // check order if passed 14 days
      const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000; // in milliseconds

      const now = new Date();
      if (now - order.createdAt > FOURTEEN_DAYS) {
        throw new AppError("refundPeriodExpired", 409);
      }

      /* 3️⃣ Access control */
      if (user.role !== "admin" && order.customerId !== user.id) {
        throw new AppError("forbidden", 403);
      }
      /* 4️⃣ Check order refundable */
      assertOrderRefundable(order);

      // 5️⃣ Check if active refund request already exists
      const existingRefund = await prisma.refund.findFirst({
        where: {
          orderId: order.id,
          status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] },
        },
      });
      if (existingRefund) throw new AppError("refundAlreadyRequested", 409);

      /* 6️⃣ Refunded quantities */
      const refundedQtyMap = await getRefundedQtyMap(order.id);

      /* 7️⃣ Validate items */
      if (items.length) {
        validateRefundItems({ order, items, refundedQtyMap });
      }
      console.log("refundedQtyMap", refundedQtyMap);

      /* 8️⃣ Build refund items */
      const refundItems = buildRefundItems({
        order,
        items,
        refundedQtyMap,
      });
      console.log("refundItems", refundItems);

      if (!refundItems.length) {
        throw new AppError("nothingToRefund", 409);
      }

      /* 9️⃣ Calculate amount */
      const amount = calculateRefundAmount(refundItems);

      /* 🔟 Create refund request */
      const refund = await prisma.$transaction(async (tx) => {
        return await tx.refund.create({
          data: {
            orderId: order.id,
            amount,
            reason,
            status: "REQUESTED",
            requestedById: user.id,
            provider: order.paymentMethod === "CREDIT_CARD" ? "PAYMOB" : "N/A",
            items:
              amount >= order.totalAmount ? undefined : { create: refundItems },
          },
          include: { items: true },
        });
      });

      // 11️⃣ Respond
      res
        .status(201)
        .json({ refund, message: getTranslation(lang, "refundRequested") });

      // 12️⃣ Notify admins
      await pushNotification({
        key: {
          title: "notification_refund_requested_title",
          desc: "notification_refund_requested_desc",
        },
        args: { title: [user.full_name], desc: [order.orderNumber] },
        lang,
        users: [],
        sendToAdmins: true,
        data: {
          navigate: "refunds",
          route: `/${lang}/refunds?id=${refund.id}`,
        },
      });
    } catch (err) {
      console.error(err);

      const status = err.statusCode || 500;
      res.status(status).json({
        message: getTranslation(lang, err.message || "internalError"),
      });
    }
  })
  .get(authorization(), async (req, res) => {
    const lang = langReq(req);
    const user = req.user;

    try {
      const api = new FeatureApi(req)
        .filter()
        .fields()
        .sort()
        .skip()
        .limit(10)
        .keyword(
          [
            "order.orderNumber",
            "order.customer.full_name",
            "reviewedBy.full_name",
          ],
          "OR",
        );

      // Admin can get all refunds, customer only their own
      const whereClause =
        user.role === "admin"
          ? api.data.where || {}
          : { ...api.data.where, requestedById: user.id };

      // If no select provided, fallback to include items and order
      const queryOptions = {
        ...api.data,
        where: whereClause,
        include: api.data.select
          ? undefined
          : { items: true, order: { include: { items: true } } },
      };

      const refunds = await prisma.refund.findMany(queryOptions);

      const totalCount = await prisma.refund.count({ where: whereClause });
      const totalPages = Math.ceil(totalCount / +api.data.take);

      res.status(200).json({
        refunds,
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
  });

// Approve / Reject refund (admin only)
router.put("/:id", authorization(), async (req, res) => {
  const lang = langReq(req);
  const user = req.user;
  const { status } = req.body; // APPROVED | REJECTED
  const id = Number(req.params.id);

  if (user.role !== "admin")
    return res.status(403).json({ message: getTranslation(lang, "forbidden") });

  if (!["APPROVED", "REJECTED"].includes(status))
    return res
      .status(422)
      .json({ message: getTranslation(lang, "invalidStatus") });

  try {
    const refund = await prisma.refund.findUnique({
      where: { id },
      include: { items: true, order: true },
    });

    if (!refund)
      return res
        .status(404)
        .json({ message: getTranslation(lang, "notFound") });

    if (refund.status !== "REQUESTED")
      return res
        .status(400)
        .json({ message: getTranslation(lang, "refundAlreadyProcessed") });

    const order = refund.order;
    const amount = refund.amount;
    let paymentAttempt = null;

    /* ---------------- PAYMOB (only on approve) ---------------- */
    if (status === "APPROVED" && order.paymentMethod === "CREDIT_CARD") {
      try {
        const paymobResult = await processPaymobRefund({
          transactionId: order.paymentId,
          amount,
        });

        paymentAttempt = await prisma.paymentAttempt.create({
          data: {
            orderId: order.id,
            provider: "PAYMOB",
            intentionId: order.paymentId,
            status:
              order.refundedAmount + amount >= order.totalAmount
                ? "REFUNDED"
                : "PARTIALLY_REFUNDED",
            rawResponse: paymobResult.rawResponse,
          },
        });
      } catch (err) {
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

    /* ---------------- BUSINESS TRANSACTION ---------------- */
    const updatedRefund = await prisma.$transaction(async (tx) => {
      const updated = await tx.refund.update({
        where: { id },
        data: {
          status: status === "APPROVED" ? "COMPLETED" : "REJECTED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          paymentAttemptId: paymentAttempt ? paymentAttempt.id : null,
        },
      });

      if (status === "APPROVED") {
        const newRefundedAmount = order.refundedAmount + amount;

        await tx.order.update({
          where: { id: order.id },
          data: {
            refundedAmount: newRefundedAmount,
            paymentStatus:
              newRefundedAmount >= order.totalAmount
                ? "REFUNDED"
                : "PARTIALLY_REFUNDED",
          },
        });
      }

      return updated;
    });

    /* ---------------- NOTIFICATION ---------------- */
    await pushNotification({
      key: {
        title: "notification_refund_status_title",
        desc: "notification_refund_status_desc",
      },
      args: { title: [], desc: [order.orderNumber, status] },
      lang,
      users: [{ id: refund.requestedById }],
      sendToAdmins: false,
      data: {
        navigate: "orders",
        route: `/${lang}/orders?id=${order.id}`,
      },
    });

    res.status(200).json({
      refund: updatedRefund,
      message: getTranslation(lang, "updated"),
    });
  } catch (err) {
    console.error(err);

    res.status(err.statusCode || 500).json({
      message: getTranslation(lang, err.message || "internalError"),
    });
  }
});

export default router;
