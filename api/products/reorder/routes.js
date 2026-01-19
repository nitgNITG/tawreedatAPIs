import express from "express";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import { z } from "zod";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import revalidateDashboard from "../../../utils/revalidateDashboard.js";

const router = express.Router();

// Zod schema for products reorder
const productsReorderSchema = z.object({
  products: z
    .array(
      z.object({
        id: z.uuid(),
        sort_id: z.number().int().min(1),
      }),
    )
    .min(1, "At least one product is required"),
});

router.post("/", authorization({ roles: ["admin"] }), async (req, res) => {
  const lang = langReq(req);

  try {
    // Validate input
    const parsed = productsReorderSchema.safeParse(req.body);

    if (!parsed.success) {
      if (process.env.NODE_ENV === "development") {
        console.log(
          parsed.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        );
      }
      return res.status(400).json({
        message: parsed.error.issues[0].message,
        errors: parsed.error.issues,
      });
    }

    const { products } = parsed.data;

    // Build SQL
    const caseSql = products
      .map((product) => `WHEN '${product.id}' THEN ${product.sort_id}`)
      .join(" ");
    const idsSql = products.map((product) => `'${product.id}'`).join(",");

    const rawQuery = `
    UPDATE product
    SET sort_id = CASE id
    ${caseSql}
    END
    WHERE id IN (${idsSql});
    `;
    console.log(rawQuery);

    // Execute raw SQL
    await prisma.$executeRawUnsafe(rawQuery);

    res.status(200).json({
      message: "products reordered successfully",
    });

    await revalidateDashboard("products");
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
