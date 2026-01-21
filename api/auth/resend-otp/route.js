import express from "express";
import prisma from "../../../prisma/client.js";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import generateCode from "../../../utils/generateCode.js";
import buildVerificationEmail from "../../../utils/buildVerificationEmail.js";
import sendEmail from "../../../nodemailer/sendEmail.js";
// import { sendSMSMessage } from "../../../utils/OTP-messages.js";

const router = express.Router();

router.get("/", authorization(), async (req, res) => {
  const lang = langReq(req); // ✅ consistent with your other routes

  try {
    const user = req.user;

    if (user.is_confirmed) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "already_confirmed") });
    }

    const code = generateCode(6);

    // ✅ delete old codes for this user
    await prisma.userVerify.deleteMany({
      where: {
        user_id: user.id, // if your prisma field is userId, change to userId
      },
    });

    // ✅ create new code linked to email OR phone
    await prisma.userVerify.create({
      data: {
        code: String(code),
        user_id: user.id, // if your prisma field is userId, change to userId
        phone: user.phone,
        email: user.email || null, // ✅ only set if exists
      },
    });

    // ✅ send via email only if the user has email
    if (user.email) {
      try {
        const { subject, text, html } = buildVerificationEmail({
          name: user.full_name,
          code,
          lang,
        });

        await sendEmail({
          to: user.email,
          subject,
          text,
          html,
        });
      } catch (error) {
        console.error("Email send failed:", error?.message || error);
      }
    } else {
      // Optional: send SMS if you have it
      // await sendSMSMessage({
      //   message: `Your OTP is ${code}`,
      //   recipients: [+user?.phone?.split("+")?.[1]],
      // });
    }

    // ⚠️ Don't return OTP in production.
    res.status(200).json({
      message: getTranslation(lang, "success_send_opt"),
      // code, // remove in production
      via: user.email ? "email" : "phone",
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
