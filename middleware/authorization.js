import jwt from "jsonwebtoken";
import prisma from "../prisma/client.js";
import getTranslation from "./getTranslation.js";

const SESSION_DURATION_MINUTES = 60; // default session (no remember me)

/**
 * @param {{
 *  includePassword?: boolean,
 *  roles?: ("admin" | "customer" | "supplier")[]
 * }} options
 */
const authorization =
  (options = {}) =>
  async (req, res, next) => {
    const lang = req.query.lang || "ar";
    const {
      includePassword = false,
      roles = null, // 👈 null = allow all roles
    } = options;

    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res
          .status(401)
          .json({ message: getTranslation(lang, "provide_token") });
      }

      const token = authHeader.split(" ")[1];
      const tokenParts = token?.split(".");
      if (tokenParts?.length !== 3) {
        return res
          .status(400)
          .json({ message: getTranslation(lang, "invalid_token_format") });
      }

      let payload;
      try {
        payload = jwt.verify(token, process.env.SECRET_KEY);
      } catch {
        return res
          .status(401)
          .json({ message: getTranslation(lang, "invalid_token_format") });
      }
      const { userId, iat } = payload;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          role: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!user || user.deleted_at) {
        return res
          .status(401)
          .json({ message: getTranslation(lang, "user_not_found") });
      }

      // if (!user.is_active) {
      //   return res
      //     .status(403)
      //     .json({ message: getTranslation(lang, "user_isBlocked") });
      // }

      // 🔐 Password change invalidates token
      if (user.password_last_updated) {
        const passwordUpdatedAt = Math.floor(
          new Date(user.password_last_updated).getTime() / 1000
        );

        if (passwordUpdatedAt > iat) {
          return res.status(401).json({
            message: getTranslation(lang, "password_has_been_changed"),
          });
        }
      }

      // // ⏳ Session expiration using last_login_at
      // if (user.last_login_at) {
      //   const lastLogin = new Date(user.last_login_at).getTime();
      //   const expiresAt = lastLogin + SESSION_DURATION_MINUTES * 60 * 1000;

      //   if (Date.now() > expiresAt) {
      //     return res.status(401).json({
      //       message: getTranslation(lang, "session_expired"),
      //     });
      //   }
      // }
      const roleName = user.role?.name;

      if (Array.isArray(roles) && roles.length > 0) {
        if (!roles.includes(roleName)) {
          return res.status(403).json({
            message: getTranslation(lang, "not_authorized"),
          });
        }
      }

      if (!includePassword) delete user.password;

      // attach safe user object
      req.user = {
        ...user,
        role: roleName,
      };

      next();
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "not_authorized"),
      });
    }
  };

export default authorization;
