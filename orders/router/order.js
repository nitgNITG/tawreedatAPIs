import express from "express";
import { redirectPayment } from "../services/redirect-payment.js";
import { orderSession } from "../services/order-session.js";
import { payment } from "../services/payment.js";
import authorization from "../../middleware/authorization.js";
import { paymentWithPoints } from "../services/paymentWithPoints.js";
import UrwayPayment from "../services/urway-payment.js";
const router = express.Router();

router.post("/redirect-payment", redirectPayment);
router.get("/order-session/:id", orderSession);
router.post("/payment/urway/:sessionId", authorization, UrwayPayment);
router.post("/payment/:sessionId", authorization, payment);
router.post(
  "/payment-with-points/:sessionId",
  authorization,
  paymentWithPoints
);

export default router;
