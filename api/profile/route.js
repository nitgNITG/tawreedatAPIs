import express from "express";
import { z } from "zod";
import prisma from "../../prisma/client.js";
import deleteImage from "../../utils/deleteImage.js";
import uploadImage from "../../utils/uploadImage.js";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import upload from "../../middleware/upload.js";
import parsePhoneNumber from "libphonenumber-js";

export const userSchema = (lang) => {
  return z.object({
    phone: z.string({ message: getTranslation(lang, "invalid_phone") }).refine(
      (phone) => {
        return parsePhoneNumber(phone)?.isValid();
      },
      { message: getTranslation(lang, "invalid_phone") }
    ),
    fullname: z
      .string({ message: getTranslation(lang, "name_required") })
      .min(1, { message: getTranslation(lang, "name_required") })
      .max(100, { message: getTranslation(lang, "name_too_long") }),
    email: z
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
    birthDate: z
      .union([z.string(), z.date()], {
        message: getTranslation(lang, "invalid_birthDate"),
      })
      .transform((el) => {
        const date = new Date(el);
        // Validate that the date is reasonable (not in future, not too old)
        const now = new Date();
        const minDate = new Date(now.getFullYear() - 120, 0, 1); // 120 years ago

        if (isNaN(date.getTime())) {
          throw new Error(getTranslation(lang, "invalid_birthDate"));
        }
        if (date > now) {
          throw new Error(getTranslation(lang, "birthdate_future_error"));
        }
        if (date < minDate) {
          throw new Error(getTranslation(lang, "birthdate_too_old_error"));
        }

        return date;
      })
      .optional(),
    address: z
      .string({ message: getTranslation(lang, "address_required") })
      .optional(),
    isDeleted: z.union([z.stringbool(), z.boolean()]).optional(),
    deleteImage: z.union([z.stringbool(), z.boolean()]).optional(),
  });
};

const router = express.Router();

router
  .route("/")
  .put(authorization, upload.single("imageUrl"), async (req, res) => {
    const lang = langReq(req);
    try {
      const user = req.user;
      if (!user) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const id = user.id;

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

      const isUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!isUser)
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });

      if (data.phone) {
        const isPhone = await prisma.user.findFirst({
          where: { phone: data.phone, NOT: { id } },
        });
        if (isPhone)
          return res
            .status(400)
            .json({ message: getTranslation(lang, "phone_already_used") });
      }

      if (data.email) {
        const isEmail = await prisma.user.findFirst({
          where: { email: data.email, NOT: { id } },
        });
        if (isEmail)
          return res
            .status(400)
            .json({ message: getTranslation(lang, "email_already_used") });
      }

      // Handle image upload
      const file = req.file;
      if (file) {
        const uploadedPath = await uploadImage(file, `/users`);
        if (!uploadedPath) {
          return res.status(500).json({
            message: getTranslation(lang, "image_upload_failed"),
          });
        }
        data.imageUrl = uploadedPath;
        console.log("image uploaded successfully", data.imageUrl);
      }

      console.log("User data to be updated:", data);

      // Update user in Prisma with timeout handling
      const updatedUser = await Promise.race([
        prisma.user.update({
          where: { id },
          data,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Database timeout")), 25000)
        ),
      ]);

      // Remove sensitive fields
      const safeUser = { ...updatedUser };
      delete safeUser.password;
      delete safeUser.fcmToken;

      return res.status(200).json({
        message: getTranslation(lang, "success"),
        user: safeUser,
      });
    } catch (error) {
      console.error("Route error:", error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization, async (req, res) => {
    const lang = langReq(req);
    try {
      const user = req.user;
      if (!user) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const id = user.id;

      const isUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!isUser)
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });

      // Get application settings to check if permanent delete is enabled
      const appSettings = await prisma.applicationSettings.findFirst();
      const isPermanentDeleteEnabled = appSettings?.permanentDelete || false;

      if (isPermanentDeleteEnabled) {
        // Delete user image if exists
        if (isUser.imageUrl) {
          await deleteImage(isUser.imageUrl);
        }

        // Delete all related records in a transaction
        await prisma.$transaction([
          // Delete wallet records
          prisma.wallet.deleteMany({
            where: { userId: id },
          }),
          // Delete user addresses
          prisma.userAddress.deleteMany({
            where: { userId: id },
          }),
          // Delete user verification records
          prisma.userVerify.deleteMany({
            where: { userId: id },
          }),
          // Finally delete the user
          prisma.user.delete({
            where: { id },
          }),
        ]);

        return res.status(200).json({
          message: getTranslation(lang, "account_permanently_deleted"),
        });
      } else {
        // Soft delete (archive) logic
        // Update user in Prisma
        await prisma.user.update({
          where: { id },
          data: {
            isDeleted: true,
          },
        });

        return res.status(200).json({
          message: getTranslation(lang, "account_deleted_successfully"),
        });
      }
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
