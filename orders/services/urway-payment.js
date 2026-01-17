import getTranslation from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import isExpired from "../../utils/isExpired.js";
import { generateHash } from "../../utils/urway.js";

const UrwayPayment = async (req, res, next) => {
  const lang = req.query.lang || "ar";
  const sessionId = +req.params.sessionId;
  try {
    const user = req.user;
    const session = await prisma.brandOrderSession.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        expired: true,
        brandToken: {
          select: {
            expired: true,
            brand: {
              select: {
                id: true,
                name: true,
                email: true,
                logo: true,
                cover: true,
                validTo: true,
                ratio: true,
                pointBackRatio: true,
                validityPeriod: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }
    if (isExpired(session.createdAt, 30)) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }
    if (session.expired) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }
    if (session.brandToken.expired) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }
    if (session.brandToken.brand.validTo < new Date()) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }

    const requestHash = generateHash({
      terminalId: process.env.URWAY_TerminalId,
      password: process.env.URWAY_Password,
      merchantKey: process.env.URWAY_MerchantKey,
      trackid: session.id,
      amount: parseFloat(session.amount),
      currency: "SAR",
    });

    const payload = {
      terminalId: process.env.URWAY_TerminalId,
      password: process.env.URWAY_Password,
      merchantIp: req.socket.remoteAddress ?? "127.0.0.1",
      action: "1", // 1 = Purchase
      trackid: session.id,
      currency: "SAR",
      country: "SA",
      amount: parseFloat(session.amount),
      customerEmail: user.email,
      firstName: user.full_name.split(" ")[0],
      lastName: user.full_name.split(" ")[1] ?? "",
      phoneNumber: user.phoneNumber,
      requestHash,
      udf1: "",
      udf2: `https://www.paypoins.com/${user.lang}/paypoins/${session.id}/success-payment`,
      // udf2: `http://localhost:3000/${user.lang}/paypoins/${session.id}/success-payment`,
    };

    const urwayRes = await fetch(process.env.URWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await urwayRes.json();
    console.log("res data -> ", data);

    if (data?.targetUrl && data?.payid) {
      console.log("redirectUrl -> ", data.targetUrl);
      return res
        .status(200)
        .json({ redirectUrl: `${data.targetUrl}?paymentid=${data.payid}` });
    } else {
      console.error("error from else ->>", error);
      return res.status(400).json({
        message: "URWAY failed to generate payment URL",
        details: data,
      });
    }
  } catch (error) {
    console.error("error from catch ->>", error);
    res.status(400).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
};

export default UrwayPayment;
