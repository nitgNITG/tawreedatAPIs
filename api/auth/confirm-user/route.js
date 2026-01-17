import express from "express";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import { z } from "zod";
import isExpired from "../../../utils/isExpired.js";


const confirmUserSchema = (lang) => {
  return z.object({
    code: z.string({
      message: getTranslation(lang, "code_is_required"),
    }),
  });
};
const router = express.Router();
router.post("/", authorization(), async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;
    const resultValidation = confirmUserSchema(lang).safeParse(req.body);
    if (!resultValidation.success) {
      return res.status(400).json({
        message: resultValidation.error.issues[0].message,
        errors: resultValidation.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    const { code } = resultValidation.data;
    const isCode = await prisma.userVerify.findFirst({
      where: {
        phone: user.phone,
        code: code,
      },
    });
    if (!isCode) {
      return res.status(400).json({
        message: getTranslation(lang, "notFound"),
        isConfirmed: false,
      });
    }
    if (isExpired(isCode.created_at, 5)) {
      await prisma.userVerify.deleteMany({
        where: {
          phone: user.phone,
        },
      });
      return res.status(400).json({
        message: getTranslation(lang, "codeInvalid"),
        isConfirmed: false,
      });
    }
    await prisma.userVerify.deleteMany({
      where: {
        phone: user.phone,
      },
    });

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        is_confirmed: true,
      },
    });
    return res
      .status(200)
      .json({ message: getTranslation(lang, "success"), isConfirmed: true });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});
export default router;
