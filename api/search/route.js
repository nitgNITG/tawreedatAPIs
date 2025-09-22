import express from "express";
import prisma from "../../prisma/client.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";

const router = express.Router();

router.route("/").get(async (req, res) => {
  const lang = langReq(req);
  try {
    const query = req.query.q;
    if (!query || query.trim() === "") {
      return res
        .status(400)
        .json({ message: getTranslation(lang, "query_required") });
    }
    const keyword = query.toString().trim();

    const [brands, categories, products] = await Promise.all([
      prisma.brand.findMany({
        where: {
          OR: [
            { name: { contains: keyword,  } },
            { nameAr: { contains: keyword,  } },
            { description: { contains: keyword,  } },
            { descriptionAr: { contains: keyword,  } },
          ],
          isDeleted: false,
          isActive: true,
        },
        take: 10,
      }),
      prisma.category.findMany({
        where: {
          OR: [
            { name: { contains: keyword,  } },
            { nameAr: { contains: keyword,  } },
            { description: { contains: keyword,  } },
            { descriptionAr: { contains: keyword,  } },
          ],
          isActive: true,
        },
        take: 10,
      }),
      prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: keyword,  } },
            { nameAr: { contains: keyword,  } },
            { description: { contains: keyword,  } },
            { descriptionAr: { contains: keyword,  } },
            { sku: { contains: keyword,  } },
            { barcode: { contains: keyword,  } },
          ],
          isActive: true,
        },
        take: 10,
        include: {
          brand: true,
          category: true,
        },
      }),
    ]);

    res.status(200).json({
      message: getTranslation(lang, "search_success"),
      brands,
      categories,
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
