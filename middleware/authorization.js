import jwt from "jsonwebtoken";
import prisma from "../prisma/client.js";
import getTranslation from "./getTranslation.js";

const authorization = async (req, res, next) => {
  const lang = req.query.lang || "ar";

  try {
    if (
      !req.headers.authorization &&
      !req.headers?.authorization?.includes("Bearer ")
    ) {
      console.error("No token provided");
      return res
        .status(401)
        .json({ message: getTranslation(lang, "provide_token") });
    } else {
      const token = req.headers.authorization.split(" ")[1];
      const tokenParts = token?.split(".");
      if (tokenParts?.length !== 3) {
        return res
          .status(400)
          .json({ message: getTranslation(lang, "invalid_token_format") });
      }
      const { userId, iat } = jwt.verify(token, process.env.SECRET_KEY);

      const user = await prisma.user.findUnique({
        where: { id: `${userId}` },
      });

      if (!user) {
        console.error("User not found");
        return res.status(401).json({
          success: false,
          message: getTranslation(lang, "user_not_found"),
        });
      }
      const timeChangedPassword = parseInt(
        user.passwordLastUpdated.getTime() / 1000,
        10
      );
      if (timeChangedPassword > iat) {
        console.error("Password has been changed");
        return res.status(401).json({
          message: getTranslation(lang, "password_has_been_changed"),
          success: false,
        });
      }

      delete user.password;
      delete user.passwordLastUpdated;
      delete user.lastLoginAt;
      delete user.updatedAt;
      delete user.createdAt;
      req.user = user;
      next();
    }
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      success: false,
      message: getTranslation(lang, "not_authorized"),
      error: error.message,
    });
  }
};

export default authorization;
