import express from "express";
import { z } from "zod";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import getTranslation, {
  langReq,
} from "../../../middleware/getTranslation.js";
import generateCode from "../../../utils/generateCode.js";

export const userSchema = (lang) => {
  return z.object({
    email: z.email({ message: getTranslation(lang, "invalid_email") }),
  });
};

const router = express.Router();

router.route("/").patch(authorization, async (req, res) => {
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

    if (data.email === user.email) {
      return res
        .status(400)
        .json({ message: getTranslation(lang, "same_email") });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email, NOT: { id } },
    });
    if (existingUser && existingUser.id !== id) {
      return res.status(400).json({
        message: getTranslation(lang, "email_in_use"),
      });
    }
    const code = generateCode(6);

    await prisma.userVerify.create({
      data: {
        code: String(code),
        userId: id,
        email: data.email,
      },
    });
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
