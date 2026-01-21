import getTranslation from "../middleware/getTranslation.js";
import prisma from "../prisma/client.js";

/**
 * Check if a user exists by ID
 * @param{string} userId - ID of the user
 * @returns boolean
 */
export const checkUserExists = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }, // only fetch the id for efficiency
  });
  return !!user;
};

export async function ensureCustomerOr404(lang, userId) {
  const customer = await prisma.customer.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!customer) {
    return {
      ok: false,
      status: 404,
      message: getTranslation(lang, "customer_not_found"),
    };
  }

  return { ok: true, customer };
}

export async function ensureCustomerCart(lang, userId) {
  // must be customer
  const customer = await ensureCustomerOr404(lang, userId);

  if (!customer.ok) {
    return {
      ok: false,
      status: 403,
      message: getTranslation(lang, "not_allowed"),
    };
  }

  // ensure cart exists
  const cart = await prisma.cart.upsert({
    where: { customer_id: userId },
    update: {},
    create: { customer_id: userId, total_price: 0 },
    select: { id: true, customer_id: true },
  });

  return { ok: true, cart };
}
