import express from "express";
import getTranslation from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import prisma from "../../prisma/client.js";
import { z } from "zod";
import authorization from "../../middleware/authorization.js";

export const roleSchema = (lang) => {
  return z.object({
    name: z
      .string({ message: getTranslation(lang, "name_required") })
      .min(1, { message: getTranslation(lang, "name_required") })
      .max(100, { message: getTranslation(lang, "name_too_long") }),
    description: z
      .string()
      .min(1, {
        message: getTranslation(lang, "ads_description_is_required"),
      })
      .optional(),
    deleted_at: z
      .union([
        z.string().transform((s) => new Date(s)), // transform string to Date
        z.date(), // accept actual Date objects
      ])
      .nullable()
      .optional(),
  });
};

const router = express.Router();

router
  .route("/")
  .post(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = req.query.lang || "en";
    try {
      const resultValidation = roleSchema(lang).safeParse(req.body);
      if (!resultValidation.success) {
        console.log(resultValidation.error);

        return res.status(400).json({
          message: resultValidation.error.errors[0].message,
          errors: resultValidation.error.errors,
        });
      }

      const data = resultValidation.data;

      // ✅ correct model
      const role = await prisma.userRole.create({ data });

      return res.json({ message: getTranslation(lang, "success"), data: role });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .get(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = req.query.lang || "en";
    try {
      const data = new FeatureApi(req)
        .filter()
        .skip()
        .sort()
        .limit()
        .keyword(["name, description"], "OR").data; // your model only has `name` in the snippet

      // ✅ correct model
      const totalRoles = await prisma.userRole.count({ where: data.where });
      const totalPages = Math.ceil(
        totalRoles / (Number.parseInt(data.take) || 10),
      );

      // ✅ include users count directly from relation
      const roles = await prisma.userRole.findMany({
        ...data,
        include: {
          _count: {
            select: { users: true },
          },
        },
      });

      // keep your response shape (userCount)
      const rolesWithUserCount = roles.map((r) => ({
        ...r,
        userCount: r._count?.users ?? 0,
        _count: undefined,
      }));

      res.status(200).json({
        roles: rolesWithUserCount,
        totalRoles,
        totalPages,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
