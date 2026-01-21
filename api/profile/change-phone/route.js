import express from "express";
import { z } from "zod";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import generateCode from "../../../utils/generateCode.js";
import buildVerificationEmail from "../../../utils/buildVerificationEmail.js";
import sendEmail from "../../../nodemailer/sendEmail.js";

export const userSchema = (lang) => {
  return z.object({
    phone: z
      .string()
      .transform((phone) => {
        return isValidPhone(phone)?.phone;
      })
      .refine((input) => parsePhoneNumber(input)?.isValid(), {
        message: getTranslation(lang, "invalid_phone"),
      }),
  });
};

const router = express.Router();

router.route("/").patch(authorization, async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;
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

    if (data.phone === user.phone) {
      return res
        .status(400)
        .json({ message: getTranslation(lang, "same_phone") });
    }

    const existingUser = await prisma.user.findUnique({
      where: { phone: data.phone, NOT: { id } },
    });
    if (existingUser) {
      return res.status(400).json({
        message: getTranslation(lang, "phone_in_use"),
      });
    }
    const code = generateCode(6);

    await prisma.userVerify.create({
      data: {
        code: String(code),
        userId: id,
        phone: data.phone,
      },
    });

    try {
      const { subject, text, html } = buildVerificationEmail({
        name: user.full_name,
        code,
        lang,
      });

      await sendEmail({
        to: data.email,
        subject,
        text,
        html,
      });
    } catch (error) {
      console.error("Email send failed:", error?.message || error);
    }
    // res.status(200).json({ message: getTranslation(lang, "check_phone") });
    res.status(200).json({ message: getTranslation(lang, "check_email") });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
