import prisma from "../../prisma/client.js";
import { AppError } from "../../utils/appError.js";

/* ---------------------------------- */
/* Fetch order with items */
/* ---------------------------------- */
export async function getOrderOrThrow(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    throw new AppError("ORDER_NOT_FOUND", 404);
  }

  return order;
}

/* ---------------------------------- */
/* Check order eligibility */
/* ---------------------------------- */
export function assertOrderRefundable(order) {
  const isNotRefundable =
    order.status === "CANCELLED" ||
    order.paymentStatus === "PENDING" ||
    order.paymentStatus === "FAILED" ||
    order.paymentStatus === "REFUNDED" ||
    order.refundedAmount >= order.totalAmount;

  if (isNotRefundable) {
    throw new AppError("ORDER_NOT_REFUNDABLE", 409);
  }
}

/* ---------------------------------- */
/* Get refunded quantities per item */
/* ---------------------------------- */
export async function getRefundedQtyMap(orderId) {
  const refundedItems = await prisma.refundItem.findMany({
    where: {
      refund: {
        orderId,
        status: { in: ["APPROVED", "PROCESSING", "COMPLETED"] },
      },
    },
  });
  console.log("refundedItems", refundedItems);
  

  return refundedItems.reduce((acc, ri) => {
    acc[ri.orderItemId] = (acc[ri.orderItemId] || 0) + ri.quantity;
    return acc;
  }, {});
}

/* ---------------------------------- */
/* Validate requested items */
/* ---------------------------------- */
export function validateRefundItems({ order, items, refundedQtyMap }) {
  for (const item of items) {
    const orderItem = order.items.find((i) => i.id === item.orderItemId);

    if (!orderItem) {
      throw new AppError("INVALID_ORDER_ITEM", 422);
    }

    const refundedQty = refundedQtyMap[item.orderItemId] || 0;
    const remainingQty = orderItem.quantity - refundedQty;

    if (item.quantity > remainingQty) {
      throw new AppError("REFUND_QTY_EXCEEDS", 409);
    }
  }
}

/* ---------------------------------- */
/* Build refund items */
/* ---------------------------------- */
export function buildRefundItems({ order, items, refundedQtyMap }) {
  // Partial refund
  if (items.length > 0) {
    return items.map((i) => {
      const oi = order.items.find((o) => o.id === i.orderItemId);

      return {
        orderItemId: i.orderItemId,
        quantity: i.quantity,
        amount: oi.price * i.quantity,
      };
    });
  }

  // Full remaining refund
  return order.items
    .filter((oi) => {
      const refundedQty = refundedQtyMap[oi.id] || 0;
      return oi.quantity - refundedQty > 0;
    })
    .map((oi) => {
      const refundedQty = refundedQtyMap[oi.id] || 0;
      const remainingQty = oi.quantity - refundedQty;

      return {
        orderItemId: oi.id,
        quantity: remainingQty,
        amount: oi.price * remainingQty,
      };
    });
}

/* ---------------------------------- */
/* Calculate refund amount */
/* ---------------------------------- */
export function calculateRefundAmount(refundItems) {
  return refundItems.reduce((sum, i) => sum + i.amount, 0);
}
