import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import express from "express";
import { z } from "zod";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import generateCode from "../../../utils/generateCode.js";
import parsePhoneNumber from "libphonenumber-js";
import { auth } from "../../../firebase/admin.js";
import buildVerificationEmail from "../../../utils/buildVerificationEmail.js";
import sendEmail from "../../../nodemailer/sendEmail.js";

const router = express.Router();

const userSchema = (lang) => {
  return z.object({
    full_name: z
      .string({ message: getTranslation(lang, "name_required") })
      .min(1, { message: getTranslation(lang, "name_required") })
      .max(100, { message: getTranslation(lang, "name_too_long") }),
    phone: z
      .string({ message: getTranslation(lang, "invalid_phone") })
      .refine(
        (phone) => {
          const phoneNumber = parsePhoneNumber(phone);
          if (
            (phoneNumber.country === "EG" || phoneNumber.country === "SA") &&
            phone.length !== 13
          )
            return null;
          return phoneNumber?.isValid();
        },
        { message: getTranslation(lang, "invalid_phone") },
      )
      .optional(),
    email: z.email({ message: getTranslation(lang, "invalid_email") }),
    password: z
      .string({ message: getTranslation(lang, "password_too_short") })
      .min(6, { message: getTranslation(lang, "password_too_short") })
      .max(100, { message: getTranslation(lang, "password_too_long") }),
  });
};

// const userSchemaEmailOrPhone = (lang) => {
//   const phoneSchema = z
//     .string({ message: getTranslation(lang, "invalid_phone") })
//     .refine(
//       (phone) => {
//         const phoneNumber = parsePhoneNumber(phone);
//         if (
//           (phoneNumber.country === "EG" || phoneNumber.country === "SA") &&
//           phone.length !== 13
//         )
//           return false;
//         return phoneNumber?.isValid();
//       },
//       { message: getTranslation(lang, "invalid_phone") },
//     );

//   return z
//     .object({
//       full_name: z
//         .string({ message: getTranslation(lang, "name_required") })
//         .min(1, { message: getTranslation(lang, "name_required") })
//         .max(100, { message: getTranslation(lang, "name_too_long") }),

//       // both optional individually...
//       email: z
//         .email({ message: getTranslation(lang, "invalid_email") })
//         .optional(),

//       phone: phoneSchema.optional(),

//       password: z
//         .string({ message: getTranslation(lang, "password_too_short") })
//         .min(6, { message: getTranslation(lang, "password_too_short") })
//         .max(100, { message: getTranslation(lang, "password_too_long") }),
//     })
//     // ...but require at least one of them
//     .refine((data) => !!data.email || !!data.phone, {
//       message: getTranslation(lang, "email_or_phone_required"),
//       path: ["email"], // where to attach the error (could also be ["phone"])
//     });
// };

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
    const isEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (isEmail)
      return res
        .status(400)
        .json({ message: getTranslation(lang, "email_already_used") });

    if (data.phone) {
      const isPhone = await prisma.user.findUnique({
        where: { phone: data.phone },
      });
      if (isPhone)
        return res
          .status(400)
          .json({ message: getTranslation(lang, "phone_already_used") });
    }
    //firebase authentication
    const firebaseUser = await auth.createUser({
      displayName: data.full_name,
      email: data.email,
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
        customer: {
          create: {
            cart: {
              create: {
                total_price: 0,
              },
            },
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
      process.env.SECRET_KEY,
    );

    // create otp
    const code = generateCode(6);

    // Send email only if user provided email
    await prisma.userVerify.create({
      data: {
        code: `${code}`,
        user_id: user.id,
        email: user.email,
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

    // const verificationTarget = data.email
    //   ? { email: data.email }
    //   : { phone: data.phone };

    // await prisma.userVerify.create({
    //   data: {
    //     code: String(code),
    //     user_id: user.id,
    //     ...verificationTarget,
    //   },
    // });

    // if (data.email) {
    //   const { subject, text, html } = buildVerificationEmail({
    //     name: user.full_name,
    //     code,
    //     lang,
    //   });

    //   await sendEmail({ to: data.email, subject, text, html });
    // } else {
    //   // TODO: send SMS to data.phone
    //   // await sendSMSMessage(...)
    // }

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

    const msg = data.email
      ? getTranslation(lang, "check_your_email")
      : getTranslation(lang, "check_your_phone"); // or "check_verification_code"

    res.status(200).json({
      message: msg,
      token,
      id: user.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
