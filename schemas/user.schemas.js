import { z } from "zod";
import { parsePhoneNumberWithError } from "libphonenumber-js";
import prisma from "../prisma/client.js";
import getTranslation from "../middleware/getTranslation.js";

export const userSchema = async (lang, create = true) => {
  let roleIds;
  if (create) {
    const roles = await prisma.userRole.findMany({
      select: {
        id: true,
      },
    });
    roleIds = roles.map((r) => r.id);
  }

  return z.object({
    full_name: z
      .string({ message: getTranslation(lang, "name_required") })
      .min(1, { message: getTranslation(lang, "name_required") })
      .max(100, { message: getTranslation(lang, "name_too_long") }),
    phone: z
      .string({ message: getTranslation(lang, "invalid_phone") })
      .refine(
        (phone) => {
          try {
            return parsePhoneNumberWithError(phone).isValid();
          } catch {
            return false;
          }
        },
        { message: getTranslation(lang, "invalid_phone") },
      )
      .optional(),
    email: z.email({ message: getTranslation(lang, "invalid_email") }),
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
    role_id: roleIds
      ? z.enum(roleIds, {
          message: getTranslation(lang, "invalid_role"),
        })
      : z
          .string({
            message: getTranslation(lang, "invalid_role"),
          })
          .optional(),
    deleted_at: z
      .preprocess((val) => {
        if (val === undefined) return undefined; // not provided
        if (val === null) return null; // JSON null
        if (val === "null") return null; // string "null" from form-data
        if (val instanceof Date) return val; // already a Date
        if (typeof val === "string" && val.trim() !== "") return new Date(val);
        return val; // let zod handle the error
      }, z.date().nullable())
      .optional(),
    deleteImage: z
      .union([
        z.string().transform((checkString) => checkString === "true"),
        z.boolean(),
      ])
      .optional(),
  });
};

export const deleteUsersSchema = (lang) => {
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
