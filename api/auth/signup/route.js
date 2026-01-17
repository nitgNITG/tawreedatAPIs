import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import express from "express";
import { z } from "zod";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import generateCode from "../../../utils/generateCode.js";
import parsePhoneNumber from "libphonenumber-js";
import { auth } from "../../../firebase/admin.js";

const router = express.Router();

const userSchema = (lang) => {
  return z.object({
    full_name: z
      .string({ message: getTranslation(lang, "name_required") })
      .min(1, { message: getTranslation(lang, "name_required") })
      .max(100, { message: getTranslation(lang, "name_too_long") }),
    phone: z.string({ message: getTranslation(lang, "invalid_phone") }).refine(
      (phone) => {
        const phoneNumber = parsePhoneNumber(phone);
        if (
          (phoneNumber.country === "EG" || phoneNumber.country === "SA") &&
          phone.length !== 13
        )
          return null;
        return phoneNumber?.isValid();
      },
      { message: getTranslation(lang, "invalid_phone") }
    ),
    email: z
      .email({ message: getTranslation(lang, "invalid_email") })
      .optional(),
    password: z
      .string({ message: getTranslation(lang, "password_too_short") })
      .min(6, { message: getTranslation(lang, "password_too_short") })
      .max(100, { message: getTranslation(lang, "password_too_long") }),
  });
};

router.post("/", async (req, res) => {
  const lang = langReq(req);
  try {
    const resultValidation = userSchema(lang).safeParse(req.body);
    if (!resultValidation.success) {
      return res.status(400).json({
        message: resultValidation.error.errors[0].message,
        errors: resultValidation.error.errors,
      });
    }
    const data = resultValidation.data;

    const isPhone = await prisma.user.findUnique({
      where: { phone: data.phone },
    });
    if (isPhone)
      return res
        .status(400)
        .json({ message: getTranslation(lang, "phone_already_used") });

    if (data.email) {
      const isEmail = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (isEmail)
        return res
          .status(400)
          .json({ message: getTranslation(lang, "email_already_used") });
    }
    //firebase authentication
    const firebaseUser = await auth.createUser({
      displayName: data.full_name,
      email: `${data.phone}@gmail.com`,
      password: data.password,
    });

    data.id = firebaseUser.uid;
    // hash password
    data.password = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        ...data,
        role: {
          connect: {
            name: "customer",
          },
        },
      },
      include: {
        role: {
          select: {
            name: true,
          },
        },
      },
    });
    const token = jwt.sign(
      { userId: user.id, role: user.role?.name },
      process.env.SECRET_KEY
    );

    // create otp
    const code = generateCode(6);

    // await prisma.userVerify.create({
    //   data: {
    //     code: `${code}`,
    //     userId: user.id,
    //     phone: user.phone,
    //   },
    // });

    //Device information.
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

    // await prisma.wallet.create({
    //   data: {
    //     point: 0,
    //     userId: user.id,
    //   },
    // });
    res.status(200).json({
      // message: getTranslation(lang, "check_your_phone"),
      message: getTranslation(lang, "login_success"),
      token,
      id: user.id,
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
