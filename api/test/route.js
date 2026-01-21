import express from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js"; // adjust path
import buildVerificationEmail from "../../utils/buildVerificationEmail.js"; // adjust path
import sendEmail from "../../nodemailer/sendEmail.js"; // adjust path

const router = express.Router();

/**
 * POST /api/test/email?lang=en
 * body: {
 *   "to": "user@example.com",
 *   "name": "Taw",
 *   "code": "123456" // optional
 * }
 */
router.post("/send-email", async (req, res) => {
  const lang = langReq(req);

  try {
    const { to, name, code } = req.body || {};

    if (!to) {
      return res.status(400).json({
        message: "Missing required field: to",
      });
    }

    // For testing, default values
    const safeName = name || "User";
    const safeCode = code || "123456";

    const { subject, text, html } = buildVerificationEmail({
      name: safeName,
      code: safeCode,
      lang,
    });

    const info = await sendEmail({
      to,
      subject,
      text,
      html,
    });

    return res.status(200).json({
      message: "Test email sent successfully",
      to,
      // Nodemailer info fields vary by transport/provider
      messageId: info?.messageId,
      accepted: info?.accepted,
      rejected: info?.rejected,
      response: info?.response,
    });
  } catch (error) {
    console.error("Test email failed:", error);
    return res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error?.message || String(error),
    });
  }
});

export default router;
