// import express from "express";
// import jwt from "jsonwebtoken";
// import prisma from "../../../prisma/client.js";
// import passport from "passport";
// import { Strategy as GoogleStrategy } from "passport-google-oauth20";

// const router = express.Router();

// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//       callbackURL: `${process.env.BASE_URL}/api/auth/google/callback`,
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       try {
//         let user = await prisma.user.findUnique({
//           where: { email: profile.emails[0].value },
//         });

//         if (!user) {
//           user = await prisma.user.create({
//             data: {
//               email: profile.emails[0].value,
//               fullname: profile.displayName,
//               imageUrl: profile.photos[0]?.value,
//               loginType: "GOOGLE",
//             },
//           });
//         }

//         return done(null, user);
//       } catch (err) {
//         return done(err, null);
//       }
//     }
//   )
// );

// router.get(
//   "/",
//   passport.authenticate("google", {
//     scope: ["email", "profile"],
//     session: false,
//   })
// );
// // router.get(
// //   "/callback",
// //   passport.authenticate("google", {
// //     session: false,
// //     failureRedirect: "/",
// //   }),
// //   (req, res) => {
// //     const token = jwt.sign(
// //       {
// //         userId: req.user.id,
// //         role: req.user.role,
// //       },
// //       process.env.SECRET_KEY,
// //       { expiresIn: process.env.JWT_EXPIRY || "7d" }
// //     );
// //     const redirectUrl =
// //       req.query.state || process.env.FRONTEND_URL || "http://localhost:3000";

// //     // if (redirectUrl.startsWith("http") || redirectUrl.startsWith("https")) {
// //     //   // res.cookie("token", token, {
// //     //   //   maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
// //     //   // });

// //     //   return res.redirect(req.query.state);
// //     // }
// //     res.json({message: "Login successful", token });
// //     // res.redirect(`${req.query.state}?token=${token}`);
// //   }
// // );

// router.get(
//   "/callback",
//   passport.authenticate("google", {
//     session: false,
//     failureRedirect: "/",
//   }),
//   (req, res) => {
//     const token = jwt.sign(
//       {
//         userId: req.user.id,
//         role: req.user.role,
//       },
//       process.env.SECRET_KEY,
//       { expiresIn: process.env.JWT_EXPIRY || "7d" }
//     );
//     res.json({ message: "Login successful", token });
//   }
// );

// export default router;

import express from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import prisma from "../../../prisma/client.js";

const router = express.Router();
const client = new OAuth2Client();

router.post("/verify", async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Missing Google ID token" });
    }

    // Verify token with Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: [
        process.env.GOOGLE_WEB_CLIENT_ID,
        process.env.GOOGLE_FLUTTER_CLIENT_ID,
      ],
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const fullname = payload.name;
    const imageUrl = payload.picture;

    if (!email) {
      return res.status(400).json({ message: "Invalid Google token" });
    }

    // Check if user exists
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          email,
          fullname,
          imageUrl,
          loginType: "GOOGLE",
        },
      });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      process.env.SECRET_KEY
      // { expiresIn: process.env.JWT_EXPIRY || "7d" }
    );
    console.log("Generated JWT:", token);

    res.status(200).json({
      message: "Login successful",
      token,
      user,
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ message: "Authentication failed", error });
  }
});

export default router;
