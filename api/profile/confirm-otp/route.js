import express from "express";
import { z } from "zod";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import { isExpired } from "../../auth/confirm-user/route.js";

export const userSchema = (lang) => {
  return z.object({
    code: z.string({ message: getTranslation(lang, "Invalid_code") }).refine(
      (code) => {
        return code.length === 6;
      },
      { message: getTranslation(lang, "Invalid_code") }
    ),
  });
};

const router = express.Router();

router.route("/").post(authorization, async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;
    if (!user) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "not_allowed") });
    }

    const id = user.id;

    const resultValidation = userSchema(lang).safeParse(req.body);
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

    const otp = await prisma.userVerify.findFirst({
      where: {
        userId: id,
        code: data.code,
      },
    });

    if (!otp) {
      return res.status(400).json({
        message: getTranslation(lang, "invalid_code"),
      });
    }

    if (otp && isExpired(otp?.createdAt, 10)) {
      await prisma.userVerify.delete({
        where: {
          id: otp.id,
        },
      });
      return res.status(400).json({
        message: getTranslation(lang, "code_expired"),
      });
    }

    const updateData = {};

    if (otp.email) updateData.email = otp.email;

    if (otp.phone) updateData.phone = otp.phone;

    await prisma.user.update({
      where: {
        id: id,
      },
      data: updateData,
    });

    await prisma.userVerify.delete({
      where: {
        id: otp.id,
      },
    });
    res.status(200).json({
      message: getTranslation(
        lang,
        otp.email ? "update_email" : "update_phone"
      ),
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
