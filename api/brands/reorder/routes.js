import express from "express";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import { z } from "zod";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import revalidateDashboard from "../../../utils/revalidateDashboard.js";

const router = express.Router();

// Zod schema for brands reorder
const brandsReorderSchema = z.object({
  brands: z
    .array(
      z.object({
        id: z.number().int().positive(),
        sort_id: z.number().int().min(1),
      }),
    )
    .min(1, "At least one brand is required"),
});

router.post("/", authorization({ roles: ["admin"] }), async (req, res) => {
  const lang = langReq(req);

  try {
    // Validate input
    const parsed = brandsReorderSchema.safeParse(req.body);

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

    const { brands } = parsed.data;

    // Build SQL
    const caseSql = brands
      .map((b) => `WHEN ${b.id} THEN ${b.sort_id}`)
      .join(" ");
    const idsSql = brands.map((b) => b.id).join(",");

    const rawQuery = `
      UPDATE brand
      SET sort_id = CASE id
        ${caseSql}
      END
      WHERE id IN (${idsSql});
    `;

    // Execute raw SQL
    await prisma.$executeRawUnsafe(rawQuery);

    res.status(200).json({
      message: "Brands reordered successfully",
    });

    await revalidateDashboard("brands");
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
