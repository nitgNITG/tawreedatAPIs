import prisma from "../prisma/client.js";
import revalidateDashboard from "./revalidateDashboard.js";

export const updateBrandUpTo = async (brandId) => {
  if (!brandId) return;

  try {
    const now = new Date();

    const [brand, product] = await Promise.all([
      prisma.brand.findUnique({
        where: { id: brandId },
        select: { up_to: true }, // ✅ snake_case
      }),
      prisma.product.findFirst({
        where: {
          brand_id: brandId,
          is_active: true,
          deleted_at: null,
          stock: { gte: 1 },
          offer: { not: null, gt: 0 },
          offer_valid_from: { lte: now },
          offer_valid_to: { gte: now },
        },
        orderBy: { offer: "desc" },
        select: { offer: true },
      }),
    ]);

    const newOffer = product?.offer ?? 0;

    if (brand && newOffer !== brand.up_to) {
      await prisma.brand.update({
        where: { id: brandId },
        data: { up_to: newOffer },
      });

      await revalidateDashboard("brands");

      console.log(
        `Brand ${brandId}: Updated up_to from ${brand.up_to}% → ${newOffer}%`,
      );
    }
  } catch (error) {
    console.error(
      `Brand ${brandId}: Error updating max offer →`,
      error.message,
    );
  }
};
