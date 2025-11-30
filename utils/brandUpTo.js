import prisma from "../prisma/client.js";

export const updateBrandUpTo = async (brandId) => {
  if (!brandId) return;

  try {
    const now = new Date();

    const [brand, product] = await Promise.all([
      prisma.brand.findUnique({
        where: { id: brandId },
        select: { upTo: true },
      }),
      prisma.product.findFirst({
        where: {
          brandId,
          isActive: true,
          stock: { gte: 1 },
          offer: { not: null, gt: 0 },
          offerValidFrom: { lte: now },
          offerValidTo: { gte: now },
        },
        orderBy: { offer: "desc" },
        select: { offer: true },
      }),
    ]);

    const newOffer = product?.offer ?? 0;

    if (newOffer !== brand.upTo) {
      await prisma.brand.update({
        where: { id: brandId },
        data: { upTo: newOffer },
      });

      console.log(
        `Brand ${brandId}: Updated upTo from ${brand.upTo}% → ${newOffer}%`
      );
    }
  } catch (error) {
    console.error(
      `Brand ${brandId}: Error updating max offer →`,
      error.message
    );
  }
};
