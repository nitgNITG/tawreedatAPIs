import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import express from "express";
import { z } from "zod";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import parsePhoneNumber from "libphonenumber-js";
import DeviceDetector from "node-device-detector";
import DeviceHelper from "node-device-detector/helper.js";
import { isValidPhone } from "../../../utils/countryCode.js";
import isExpired from "../../../utils/isExpired.js";

const router = express.Router();

const isLocked = (
  attempts = 5,
  times = 0,
  lastAttempt = new Date(),
  duration = 20
) => attempts <= times && !isExpired(lastAttempt, duration);

const userSchema = (lang) => {
  return z.union([
    // Schema for phone login
    z.object({
      phone: z
        .string()
        .transform((phone) => {
          return isValidPhone(phone)?.phone;
        })
        .refine((input) => parsePhoneNumber(input)?.isValid(), {
          message: getTranslation(lang, "invalid_phone"),
        }),
      password: z
        .string({ message: getTranslation(lang, "password_too_short") })
        .min(6, { message: getTranslation(lang, "password_too_short") })
        .max(100, { message: getTranslation(lang, "password_too_long") }),
    }),
    // Schema for email login
    z.object({
      email: z.email({
        message: getTranslation(lang, "invalid_email"),
      }),
      password: z
        .string({ message: getTranslation(lang, "password_too_short") })
        .min(6, { message: getTranslation(lang, "password_too_short") })
        .max(100, { message: getTranslation(lang, "password_too_long") }),
    }),
  ]);
};
router.post("/", async (req, res) => {
  const lang = langReq(req);
  try {
    const resultValidation = userSchema(lang).safeParse(req.body);
    if (!resultValidation.success) {
      console.log("Validation failed:", resultValidation.error);
      return res.status(400).json({
        message: resultValidation.error.issues[0].message,
        errors: resultValidation.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      });
    }
    const data = resultValidation.data;

    // Determine if login is with phone or email
    const loginValue = data.phone ? data.phone : data.email;
    const where = { [data.phone ? "phone" : "email"]: loginValue };
    const user = await prisma.user.findUnique({
      where,
      include: {
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    // check if the user is already existing
    if (!user)
      return res
        .status(400)
        .json({ message: getTranslation(lang, "user_not_found") });

    if (user.deleted_at)
      return res
        .status(400)
        .json({ message: getTranslation(lang, "user_not_found") });

    if (!user.is_Active)
      return res
        .status(400)
        .json({ message: getTranslation(lang, "user_isBlocked") });

    if (!user.password && user.login_type !== "LOCAL") {
      return res.status(400).json({
        message: getTranslation(lang, "wrong_login_type"),
        loginType: user.loginType,
      });
    }

    // const settings = await prisma.aboutApp.findUnique({
    //   where: { id: "about-app" },
    //   select: {
    //     attempts_login: true,
    //     duration_attempts_login_minutes: true,
    //   },
    // });
    // the user attempt to login.
    // const userAttempts = await prisma.userAttemptsLogin.upsert({
    //   where: { userId: user.id },
    //   update: { times: { increment: 1 } },
    //   create: {
    //     times: 1,
    //     userId: user.id,
    //   },
    // });
    // const attemptsLogin = settings?.attempts_login || 5;
    // const duration = 1;
    // const times = userAttempts?.times || 0;
    // const lastAttempt = userAttempts?.lastAttempt;

    // // lock the login attempts
    // if (isLocked(attemptsLogin, times, lastAttempt, duration)) {
    //   return res.status(429).json({
    //     message: getTranslation(lang, "locked_account", [
    //       duration,
    //       attemptsLogin,
    //     ]),
    //   });
    // }

    // // update the lastAttempt if the times  large than or equal to attemptsLogin.
    // if (times == attemptsLogin) {
    //   await prisma.userAttemptsLogin.update({
    //     where: { userId: user.id },
    //     data: {
    //       lastAttempt: new Date(),
    //     },
    //   });
    // }
    // if (times > attemptsLogin) {
    //   await prisma.userAttemptsLogin.update({
    //     where: { userId: user.id },
    //     data: {
    //       times: 0,
    //     },
    //   });
    // }

    // check the password matching.
    const isMatch = await bcrypt.compare(data.password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        message: getTranslation(lang, "invalid_password"),
        attemptsMessage: getTranslation(lang, "locked_message_reminder", [
          attemptsLogin,
          times,
        ]),
      });
    }

    const token = jwt.sign(
      { userId: user.id, role: user?.role?.name },
      process.env.SECRET_KEY
    );

    if (!user.is_confirmed)
      return res
        .status(400)
        .json({ message: getTranslation(lang, "user_not_confirmed"), token });

    // user device information.
    // const deviceDetector = new DeviceDetector();
    // const userAgent = req.get("User-Agent");
    // const result = deviceDetector.detect(userAgent);

    // await prisma.userDevises.create({
    //   data: {
    //     userId: user.id,
    //     type: result?.client?.type,
    //     version: result?.client?.version,
    //     name: result?.client?.name,
    //     isDesktop: DeviceHelper.isDesktop(result),
    //     isMobile: DeviceHelper.isMobile(result),
    //   },
    // });
    // await prisma.userAttemptsLogin.update({
    //   where: { userId: user.id },
    //   data: { times: 0 },
    // });

    res.status(200).json({
      message: getTranslation(lang, "login_success"),
      token,
      user: {
        id: user.id,
        firebaseEmail: `${user.phone}@gmail.com`,
        role: user.role?.name,
      },
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
