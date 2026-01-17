import express from "express";
import { z } from "zod";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import bcrypt from "bcrypt";

const router = express.Router();

const changePasswordSchema = (lang) => {
  return z.object({
    oldPassword: z
      .string({ message: getTranslation(lang, "password_too_short") })
      .min(6, { message: getTranslation(lang, "password_too_short") })
      .max(100, { message: getTranslation(lang, "password_too_long") }),

    newPassword: z
      .string({ message: getTranslation(lang, "password_too_short") })
      .min(6, { message: getTranslation(lang, "password_too_short") })
      .max(100, { message: getTranslation(lang, "password_too_long") }),
  });
};
router.patch("/", authorization(), async (req, res) => {
  const lang = langReq(req);
  const user = req.user;
  try {
    const resultValidation = changePasswordSchema(lang).safeParse(req.body);
    if (!resultValidation.success) {
      return res.status(400).json({
        message: resultValidation.error.issues[0].message,
        errors: resultValidation.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    const data = resultValidation.data;

    if (!user.is_confirmed)
      return res
        .status(400)
        .json({ message: getTranslation(lang, "user_not_confirmed") });

    const isPasswordValid = await bcrypt.compare(
      data.oldPassword,
      user.password,
    );

    if (!isPasswordValid) {
      return res.status(400).json({
        message: getTranslation(lang, "invalid_old_password"),
      });
    }

    if (data.newPassword === data.oldPassword) {
      return res.status(400).json({
        message: getTranslation(lang, "new_password_same_as_old"),
      });
    }

    const hashPassword = await bcrypt.hash(data.newPassword, 10);

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashPassword,
      },
    });

    return res.status(200).json({
      message: getTranslation(lang, "update_password"),
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
