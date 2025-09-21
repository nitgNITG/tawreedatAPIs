import express from "express";
import jwt from "jsonwebtoken";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import passport from "passport";
import { Strategy as AppleStrategy } from "passport-apple";

const router = express.Router();
passport.use(
  new AppleStrategy(
    {
      clientID: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/api/auth/apple/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await prisma.user.findUnique({
          where: { email: profile.emails[0].value },
        });

        if (!user) {
          user = await prisma.user.create({
            data: {
              email: profile.emails[0].value,
              fullname: profile.displayName,
              imageUrl: profile.photos[0]?.value,
              loginType: "APPLE",
            },
          });
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

router.get(
  "/",
  passport.authenticate("apple", { scope: ["email", "profile"] })
);
router.get(
  "/callback",
  passport.authenticate("apple", {
    session: false,
    failureRedirect: "/",
  }),
  (req, res) => {
    const token = jwt.sign(
      {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
      },
      process.env.SECRET_KEY,
      { expiresIn: process.env.JWT_EXPIRY || "7d" }
    );
    res.json({ success: true, token, user: req.user });
  }
);

export default router;
