import express from "express";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import getTranslation from "../../../middleware/getTranslation.js";
import generateCode from "../../../utils/generateCode.js";
// import { sendSMSMessage } from "../../../utils/OTP-messages.js";

const router = express.Router();
router.get("/", authorization, async (req, res) => {
  const lang = req.query.lang || "ar";
  try {
    const user = req.user;
    if (user.isConfirmed) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "already_confirmed") });
    }
    const code = generateCode(6);
    await prisma.userVerify.deleteMany({
      where: {
        userId: user.id,
      },
    });
    await prisma.userVerify.create({
      data: {
        code: `${code}`,
        userId: user.id,
        phone: user.phone,
      },
    });
    // /// call taqnay api to send otp
    // const sms = await sendSMSMessage({
    //   message: `MastthmrApp: your otp is ${code}`,
    //   recipients: [+user?.phone?.split("+")?.[1]],
    // });

    // console.log(sms);

    res.status(200).json({ message: getTranslation(lang, "success_send_opt"), code });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});
export default router;
