import express from "express";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import { z } from "zod";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import revalidateDashboard from "../../../utils/revalidateDashboard.js";

const router = express.Router();

// Zod schema
const categoriesReorderSchema = z.object({
  categories: z
    .array(
      z.object({
        id: z.number().int().positive(),
        sort_id: z.number().int().min(1),
      }),
    )
    .min(1, "At least one category is required"),
});

router.post("/", authorization(), async (req, res) => {
  const lang = langReq(req);

  try {
    const admin = req.user;
    if (admin?.role !== "admin") {
      return res.status(403).json({
        message: getTranslation(lang, "not_allowed"),
      });
    }

    // Validate input
    const parsed = categoriesReorderSchema.safeParse(req.body);

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

    const { categories } = parsed.data;

    const caseSql = categories
      .map((c) => `WHEN ${c.id} THEN ${c.sort_id}`)
      .join(" ");

    const idsSql = categories.map((c) => c.id).join(",");

    const rawQuery = `
      UPDATE category
      SET sort_id = CASE id
        ${caseSql}
      END
      WHERE id IN (${idsSql});
    `;

    // Execute raw SQL
    await prisma.$executeRawUnsafe(rawQuery);

    res.status(200).json({
      message: "Categories reordered successfully",
    });

    await revalidateDashboard("categories");
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
