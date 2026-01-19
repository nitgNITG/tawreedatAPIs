import express from "express";
import { z } from "zod";
import prisma from "../../prisma/client.js";
import deleteImage from "../../utils/deleteImage.js";
import uploadImage from "../../utils/uploadImage.js";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import upload from "../../middleware/upload.js";
import parsePhoneNumber from "libphonenumber-js";

// Validation schema for profile update
export const userSchema = (lang) => {
  return z.object({
    phone: z
      .string({ message: getTranslation(lang, "invalid_phone") })
      .refine((phone) => parsePhoneNumber(phone)?.isValid(), {
        message: getTranslation(lang, "invalid_phone"),
      })
      .optional(),
    full_name: z
      .string({ message: getTranslation(lang, "name_required") })
      .min(1, { message: getTranslation(lang, "name_required") })
      .max(100, { message: getTranslation(lang, "name_too_long") })
      .optional(),
    email: z
      .string({ message: getTranslation(lang, "invalid_email") })
      .email({ message: getTranslation(lang, "invalid_email") })
      .optional(),
    gender: z
      .enum(["MALE", "FEMALE"], {
        message: getTranslation(lang, "invalid_gender"),
      })
      .optional(),
    lang: z
      .enum(["EN", "AR"], {
        message: getTranslation(lang, "invalid_language"),
      })
      .optional(),
    birth_date: z
      .union([z.string(), z.date()], {
        message: getTranslation(lang, "invalid_birthDate"),
      })
      .transform((el) => {
        const date = new Date(el);
        const now = new Date();
        const minDate = new Date(now.getFullYear() - 120, 0, 1);
        if (Number.isNaN(date.getTime()))
          throw new Error(getTranslation(lang, "invalid_birthDate"));
        if (date > now)
          throw new Error(getTranslation(lang, "birthdate_future_error"));
        if (date < minDate)
          throw new Error(getTranslation(lang, "birthdate_too_old_error"));
        return date;
      })
      .optional(),
    deleteImage: z.boolean().optional(),
  });
};

const router = express.Router();

router
  .route("/")
  .put(authorization(), upload.single("image_url"), async (req, res) => {
    const lang = langReq(req);
    try {
      const user = req.user;
      const id = user.id;

      // Validate incoming data
      const resultValidation = userSchema(lang).partial().safeParse(req.body);
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

      // Validate phone/email uniqueness
      if (data.phone) {
        const exists = await prisma.user.findFirst({
          where: { phone: data.phone, NOT: { id } },
        });
        if (exists)
          return res
            .status(400)
            .json({ message: getTranslation(lang, "phone_already_used") });
      }
      if (data.email) {
        const exists = await prisma.user.findFirst({
          where: { email: data.email, NOT: { id } },
        });
        if (exists)
          return res
            .status(400)
            .json({ message: getTranslation(lang, "email_already_used") });
      }

      // Handle image upload / deletion
      const file = req.file;
      if (file) {
        data.image_url = await uploadImage(file, `/users`);
        if (user.image_url) await deleteImage(user.image_url);
      }
      if (data.deleteImage && !file) {
        if (user.image_url) await deleteImage(user.image_url);
        data.image_url = null;
        delete data.deleteImage;
      }

      // Update user
      const updatedUser = await prisma.user.update({
        where: { id },
        data,
      });
      delete updatedUser.password;

      res.status(200).json({
        message: getTranslation(lang, "success"),
        updatedUser,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization(), async (req, res) => {
    const lang = langReq(req);
    try {
      const user = req.user;
      const id = user.id;
      // Permanent delete
      const appSettings = await prisma.applicationSetting.findFirst();
      const isPermanentDeleteEnabled = appSettings?.permanentDelete || false;

      if (isPermanentDeleteEnabled) {
        if (user.image_url) await deleteImage(user.image_url);
        await prisma.$transaction([
          prisma.wallet.deleteMany({ where: { user_id: id } }),
          prisma.userAddress.deleteMany({ where: { userId: id } }),
          prisma.userVerify.deleteMany({ where: { user_id: id } }),
          prisma.user.delete({ where: { id } }),
        ]);
        return res.status(200).json({
          message: getTranslation(lang, "account_permanently_deleted"),
        });
      } else {
        // Soft delete
        await prisma.user.update({
          where: { id },
          data: { deleted_at: new Date().toISOString() },
        });
        return res.status(200).json({
          message: getTranslation(lang, "account_deleted_successfully"),
        });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
