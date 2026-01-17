import express from "express";
import bcrypt from "bcrypt";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import upload from "../../../middleware/upload.js";
import uploadImage from "../../../utils/uploadImage.js";
import deleteImage from "../../../utils/deleteImage.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { auth } from "../../../firebase/admin.js";
import { z } from "zod";
import { parsePhoneNumberWithError } from "libphonenumber-js";

const router = express.Router();

const userSchema = (lang) => {
  return z.object({
    full_name: z
      .string({ message: getTranslation(lang, "name_required") })
      .min(1, { message: getTranslation(lang, "name_required") })
      .max(100, { message: getTranslation(lang, "name_too_long") }),
    phone: z.string({ message: getTranslation(lang, "invalid_phone") }).refine(
      (phone) => {
        try {
          return parsePhoneNumberWithError(phone).isValid();
        } catch {
          return false;
        }
      },
      { message: getTranslation(lang, "invalid_phone") },
    ),
    email: z
      .email({ message: getTranslation(lang, "invalid_email") })
      .optional(),
    password: z
      .string({ message: getTranslation(lang, "password_too_short") })
      .min(6, { message: getTranslation(lang, "password_too_short") })
      .max(100, { message: getTranslation(lang, "password_too_long") }),
    gender: z
      .enum(["MALE", "FEMALE"], {
        message: getTranslation(lang, "invalid_gender"),
      })
      .optional(),
    is_active: z
      .union([
        z.string().transform((checkString) => checkString === "true"),
        z.boolean(),
      ])
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
      .transform((el) => new Date(el))
      .optional(),
    is_confirmed: z
      .union([
        z.string().transform((checkString) => checkString === "true"),
        z.boolean(),
      ])
      .optional(),
    role_id: z
      .string({
        message: getTranslation(lang, "invalid_role"),
      })
      .optional(),
    deleted_at: z
      .union([
        z.string().transform((s) => new Date(s)), // transform string to Date
        z.date(), // accept actual Date objects
      ])
      .nullable()
      .optional(),

    deleteImage: z
      .union([
        z.string().transform((checkString) => checkString === "true"),
        z.boolean(),
      ])
      .optional(),
  });
};

const validateRoleIfExists = async (lang, data) => {
  if (!data.role_id) return;

  const role = await prisma.userRole.findUnique({
    where: { id: data.role_id },
    select: { id: true },
  });

  if (!role) {
    throw {
      status: 400,
      message: getTranslation(lang, "invalid_role"),
    };
  }
};

router
  .route("/:id")
  .get(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);

    const { id } = req.params;
    try {
      const data = new FeatureApi(req).fields().includes().filter({ id }).data;

      const user = await prisma.user.findUnique(data);

      delete user?.password;
      delete user?.fcm_token;

      res.status(200).json({ message: getTranslation(lang, "success"), user });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(
    authorization({ roles: ["admin"] }),
    upload.single("image_url"),
    async (req, res) => {
      const lang = langReq(req);
      const { id } = req.params;
      try {
        const resultValidation = userSchema(lang).partial().safeParse(req.body);
        if (!resultValidation.success) {
          console.log(resultValidation.error);

          return res.status(400).json({
            message: resultValidation.error.issues[0].message,
            errors: resultValidation.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          });
        }
        const data = resultValidation.data;
        await validateRoleIfExists(lang, data);

        // hash password
        const isUser = await prisma.user.findUnique({
          where: { id },
        });

        if (!isUser)
          return res
            .status(404)
            .json({ message: getTranslation(lang, "user_not_found") });

        let firebaseData = {};
        const isPhoneChanged = data.phone && data.phone !== isUser.phone;
        const isNameChanged =
          data.full_name && data.full_name !== isUser.full_name;
        const isEmailChanged = data.email && data.email !== isUser.email;
        if (isNameChanged) firebaseData.displayName = data.full_name;

        if (isPhoneChanged) {
          const isPhone = await prisma.user.findFirst({
            where: { phone: data.phone, AND: { NOT: { id } } },
          });
          if (isPhone)
            return res
              .status(400)
              .json({ message: getTranslation(lang, "phone_already_used") });
          firebaseData.email = `${data.phone}@gmail.com`;
        }
        if (isEmailChanged) {
          const isEmail = await prisma.user.findFirst({
            where: { email: data.email, AND: { NOT: { id } } },
          });
          if (isEmail)
            return res
              .status(400)
              .json({ message: getTranslation(lang, "email_already_used") });
          if (!isUser.phone && !isPhoneChanged) {
            firebaseData.email = data.email;
          }
        }
        if (data.password) {
          const hashedPassword = await bcrypt.hash(data.password, 10);
          data.password = hashedPassword;
          firebaseData.password = data.password;
        }
        if (
          isNameChanged ||
          isPhoneChanged ||
          (isEmailChanged && !isUser.phone) ||
          data.password
        ) {
          await auth.updateUser(id, firebaseData);
        }

        // Prepare update data with only changed fields
        const updateData = {};

        // Check each field for changes
        for (const key in data) {
          if (data[key] !== isUser[key] && data[key] !== undefined) {
            updateData[key] = data[key];
          }
        }

        // Handle image upload
        if (req.file) {
          const image_url = await uploadImage(req.file, `/users/${Date.now()}`);
          updateData.image_url = image_url;
          await deleteImage(isUser.image_url);
        }

        // Handle image deletion
        if (data.deleteImage && !req.file) {
          await deleteImage(isUser.image_url);
          updateData.image_url = null;
          delete updateData.deleteImage; // Remove this from update data
        }

        // Only update if there are actual changes
        let user = isUser;
        if (Object.keys(updateData).length > 0) {
          user = await prisma.user.update({
            where: { id },
            data: updateData,
            include: {
              role: {
                select: {
                  name: true,
                },
              },
            },
          });
        }
        delete user.password;
        delete user.fcm_token;
        res.status(200).json({
          message: getTranslation(lang, "success"),
          user,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          message: getTranslation(lang, "internalError"),
          error: error.message,
        });
      }
    },
  )
  .delete(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    const archived = req.query.archived || false;
    const { id } = req.params;
    try {
      const isUser = await prisma.user.findUnique({ where: { id } });
      if (!isUser)
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });

      if (archived) {
        await prisma.user.update({
          where: {
            id: id,
          },
          data: {
            deleted_at: new Date(),
          },
        });
        return res.status(200).json({
          message: getTranslation(lang, "user_archived"),
        });
      }
      // Delete all related records in a transaction
      await prisma.user.delete({
        where: { id },
      });
      res.status(200).json({ message: getTranslation(lang, "user_deleted") });
      await deleteImage(isUser.image_url);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
