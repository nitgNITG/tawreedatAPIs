import express from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import prisma from "../../prisma/client.js";
import { z } from "zod";
import authorization from "../../middleware/authorization.js";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import bcrypt from "bcrypt";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";
import { auth } from "../../firebase/admin.js";

const userSchema = async (lang) => {
  const roles = await prisma.userRole.findMany({
    select: {
      id: true,
    },
  });
  const roleIds = roles.map((r) => r.id);

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
      .enum(roleIds, {
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

const deleteUsersSchema = (lang) => {
  return z.union([
    z.object({
      notConfirmed: z.boolean(),
    }),
    z.object({
      isDeleted: z.boolean(),
    }),
    z.object({
      notActive: z.boolean(),
    }),
    z.object({
      ids: z
        .array(z.string(), {
          message: getTranslation(lang, "user_ids_required"),
        })
        .min(1, { message: getTranslation(lang, "user_ids_required") }),
      archived: z.boolean().optional(),
    }),
  ]);
};

const router = express.Router();
router
  .route("/")
  .post(
    authorization({ roles: ["admin"] }),
    upload.single("image_url"),
    async (req, res) => {
      const lang = langReq(req);
      try {
        const lang = langReq(req);

        const schema = await userSchema(lang);
        const resultValidation = schema.safeParse(req.body);

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
        const firebaseUser = await auth.createUser({
          displayName: data.full_name,
          email: `${data.phone}@gmail.com`,
          password: data.password,
        });

        const hashPassword = await bcrypt.hash(data.password, 10);

        let image_url = null;
        if (req.file)
          image_url = await uploadImage(req.file, `/users/${Date.now()}`);
        const user = await prisma.user.create({
          data: {
            id: firebaseUser.uid,
            ...data,
            password: hashPassword,
            image_url,
          },
          include: {
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        const formattedUser = { ...user };

        delete formattedUser.password;
        res.status(201).json({
          message: getTranslation(lang, "user_created_successfully"),
          user: { ...formattedUser },
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

  .get(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    try {
      const data = new FeatureApi(req)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit(10)
        .keyword(["full_name", "phone", "email"], "OR").data;

      const totalUsers = await prisma.user.count({ where: data.where });
      const totalPages = Math.ceil(
        totalUsers / (Number.parseInt(data.take) || 10),
      );

      const users = await prisma.user.findMany(data);

      res.status(200).json({
        users,
        totalUsers,
        totalPages,
      });
    } catch (error) {
      console.error(error.message);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    try {
      const resultValidation = deleteUsersSchema(lang).safeParse(req.body);
      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            field: issue.path[0],
            message: issue.message,
          })),
        });
      }

      const data = resultValidation.data;

      // Define deletion strategies
      const deletionStrategies = {
        isDeleted: {
          action: () =>
            prisma.user.deleteMany({
              where: {
                deleted_at: {
                  not: null,
                },
              },
            }),
          message: "deleted_all_users",
        },
        notConfirmed: {
          action: () =>
            prisma.user.deleteMany({ where: { isConfirmed: false } }),
          message: "deleted_all_not_confirmed_users",
        },
        notActive: {
          action: () => prisma.user.deleteMany({ where: { isActive: false } }),
          message: "deleted_all_not_active_users",
        },
        ids: {
          action: () => {
            if (data.archived) {
              return prisma.user.updateMany({
                where: { id: { in: data.ids } },
                data: { deleted_at: new Date() },
              });
            } else {
              return prisma.user.deleteMany({
                where: { id: { in: data.ids } },
              });
            }
          },
          message: () => (data.archived ? "archived_users" : "deleted_users"),
        },
      };

      // Find and execute the appropriate strategy
      const strategy = Object.keys(deletionStrategies).find((key) => data[key]);

      if (!strategy) {
        return res.status(400).json({
          message: getTranslation(lang, "invalid_delete_operation"),
        });
      }

      const usersCount = await deletionStrategies[strategy].action();

      const messageKey =
        typeof deletionStrategies[strategy].message === "function"
          ? deletionStrategies[strategy].message()
          : deletionStrategies[strategy].message;

      return res.status(200).json({
        message: getTranslation(lang, messageKey),
        count: usersCount.count,
      });
    } catch (error) {
      console.error(error.message);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
