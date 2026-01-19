import express from "express";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import { z } from "zod";
import { processPaymobPayment } from "../../orders/controllers/paymobController.js";
import { getApplicationSettings } from "../../utils/getApplicationSettings.js";
import FeatureApi from "../../utils/FetchDataApis.js";

const router = express.Router();

const createPaymentSchema = z.object({
  orderId: z.number(),
  redirectUrl: z.string().optional(),
});

const getPaymentSchema = z
  .object({
    orderId: z.coerce.number().optional(),
    intentionId: z.string().optional(),
  })
  .refine((data) => data.orderId || data.intentionId, {
    message: "orderId or intentionId is required",
  });

router.post("/", authorization(), async (req, res) => {
  const lang = langReq(req);
  const user = req.user;

  const validation = createPaymentSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({
      message: getTranslation(lang, "validationError"),
      errors: validation.error.issues,
    });
  }

  const { orderId, redirectUrl } = validation.data;

  try {
    const settings = await getApplicationSettings();

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, paymentAttempts: true },
    });

    if (!order)
      return res
        .status(404)
        .json({ message: getTranslation(lang, "orderNotFound") });

    if (order.customerId !== user.id)
      return res
        .status(403)
        .json({ message: getTranslation(lang, "forbidden") });

    if (
      order.paymentStatus === "PAID" ||
      order.paymentStatus === "PARTIALLY_REFUNDED" ||
      order.paymentStatus === "REFUNDED"
    )
      return res.status(400).json({
        message: getTranslation(lang, "orderAlreadyPaid"),
      });

    if (order.paymentMethod !== "CREDIT_CARD")
      return res.status(400).json({
        message: getTranslation(lang, "invalidPaymentMethod"),
      });

    const attemptsCount = order.paymentAttempts.length;
    if (attemptsCount >= settings.payment_attempts) {
      return res.status(429).json({
        message: getTranslation(lang, "paymentAttemptsExceeded"),
      });
    }

    // ⛔ Block parallel attempts
    const pending = order.paymentAttempts.find((a) => a.status === "PENDING");
    if (pending) {
      await prisma.paymentAttempt.update({
        where: { id: pending.id },
        data: {
          status: "FAILED",
          rawResponse: { message: "Cancelled due to new payment attempt" },
          provider: "PAYMOB",
        },
      });
      // return res.status(409).json({
      //   message: getTranslation(lang, "paymentAlreadyInProgress"),
      // });
    }

    const attempt = await prisma.paymentAttempt.create({
      data: {
        orderId: order.id,
        provider: "PAYMOB",
        status: "PENDING",
      },
    });

    const paymentResult = await processPaymobPayment({
      order: {
        ...order,
        attemptId: attempt.id,
      },
      user,
      lang,
      redirectUrl,
      paymob: {
        secretKey: settings.paymob_secret_key,
        publicKey: settings.paymob_public_key,
        baseUrl: settings.paymob_base_url,
        paymentMethods: settings.paymob_payment_methods,
        iframes: settings.paymob_iframes,
      },
    });

    if (!paymentResult.success) {
      await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "FAILED",
          rawResponse: paymentResult,
        },
      });

      return res.status(400).json({
        message: getTranslation(lang, "paymentProcessingFailed"),
        error: paymentResult.error,
      });
    }

    return res.status(201).json({
      message: getTranslation(lang, "paymentCreated"),
      payment: paymentResult,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

router.get("/", authorization(), async (req, res) => {
  const lang = langReq(req);
  const user = req.user;

  if (user.role !== "admin")
    return res.status(403).json({ message: getTranslation(lang, "forbidden") });
  //   const validation = getPaymentSchema.safeParse(req.query);
  //   if (!validation.success) {
  //     return res.status(422).json({
  //       message: getTranslation(lang, "validationError"),
  //       errors: validation.error.issues,
  //     });
  //   }

  //   const { orderId, intentionId } = validation.data;
  try {
    const data = new FeatureApi(req)
      .filter()
      .fields()
      .sort()
      .skip()
      .limit(10).data;

    const attempts = await prisma.paymentAttempt.findMany(data);
    const totalCount = await prisma.paymentAttempt.count({ where: data.where });
    const totalPages = Math.ceil(totalCount / +data.take);

    return res.json({
      attempts,
      totalCount,
      totalPages,
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
