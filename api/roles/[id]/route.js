import express from "express";
import authorization from "../../../middleware/authorization.js";
import getTranslation from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import { roleSchema } from "../route.js";

const router = express.Router();

router
  .route("/:roleId")
  .get(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = req.query.lang || "en";
    const roleId = req.params.roleId;

    try {
      const role = await prisma.userRole.findUnique({
        where: { id: roleId },
      });

      if (!role) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "not_found_role") });
      }

      return res.json({
        message: getTranslation(lang, "success"),
        data: role,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = req.query.lang || "en";
    const roleId = req.params.roleId;

    try {
      const resultValidation = roleSchema(lang).partial().safeParse(req.body);
      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.errors[0].message,
          errors: resultValidation.error.errors,
        });
      }

      const existingRole = await prisma.userRole.findUnique({
        where: { id: roleId },
      });
      if (!existingRole) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "not_found_role") });
      }

      const data = resultValidation.data;

      // ✅ correct model
      const updatedRole = await prisma.userRole.update({
        where: { id: roleId },
        data,
      });

      return res.json({
        message: getTranslation(lang, "success"),
        data: updatedRole,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = req.query.lang || "en";
    const roleId = req.params.roleId;

    try {
      const role = await prisma.userRole.findFirst({
        where: { id: roleId, deleted_at: null },
      });

      if (!role) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "not_found_role") });
      }

      const updated = await prisma.userRole.update({
        where: { id: roleId },
        data: { deleted_at: new Date() },
      });

      return res.json({
        message: getTranslation(lang, "success"),
        data: updated,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
