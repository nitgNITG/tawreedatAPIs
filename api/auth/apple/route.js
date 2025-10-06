import express from "express";
import jwt from "jsonwebtoken";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import verifyAppleToken from "verify-apple-id-token";

// import passport from "passport";
// import { Strategy as AppleStrategy } from "passport-apple";

const router = express.Router();
// passport.use(
//   new AppleStrategy(
//     {
//       clientID: process.env.APPLE_CLIENT_ID,
//       clientSecret: process.env.APPLE_CLIENT_SECRET,
//       callbackURL: `${process.env.BASE_URL}/api/auth/apple/callback`,
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
//               loginType: "APPLE",
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
//   passport.authenticate("apple", { scope: ["email", "profile"] })
// );
// router.get(
//   "/callback",
//   passport.authenticate("apple", {
//     session: false,
//     failureRedirect: "/",
//   }),
//   (req, res) => {
//     const token = jwt.sign(
//       {
//         id: req.user.id,
//         email: req.user.email,
//         role: req.user.role,
//       },
//       process.env.SECRET_KEY,
//       { expiresIn: process.env.JWT_EXPIRY || "7d" }
//     );
//     res.json({ success: true, token, user: req.user });
//   }
// );

router.post("/verify", async (req, res) => {
  try {
    const lang = langReq(req);
    const { idToken, nonce } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Missing Apple ID token" });
    }



    // Verify the token with Apple
    // The library handles fetching Apple's public keys for verification
    const jwtClaims = await verifyAppleToken({
      idToken,
      clientId: process.env.APPLE_APP_ID,
      // The nonce is an optional but highly recommended security feature.
      // If your client sends a nonce, you should verify it here.
      // nonce,
    });

    const appleUserId = jwtClaims.sub;
    const email = jwtClaims.email;

    if (!email && !appleUserId) {
      return res.status(400).json({ message: "Invalid Apple token" });
    }

    // Apple only sends the user's name on the *first* sign-in.
    // Your client should handle this and send the name with the idToken on the first request.
    const fullname = req.body.fullname;

    // Find user by their unique Apple ID
    let user = await prisma.user.findUnique({
      where: { email },
    });
    // let user = await prisma.user.findUnique({
    //   where: { id: appleUserId },
    // });

    if (!user) {
      // Create a new user since one does not exist
      // Note: `fullname` may be null if it's not the first sign-in.
      user = await prisma.user.create({
        data: {
          // id: appleUserId, // Store the unique Apple ID
          email,
          fullname,
          loginType: "APPLE",
        },
      });
    }

    // Generate your own JWT for your application
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      process.env.SECRET_KEY
    );

    console.log("Generated JWT:", token);
    res.status(200).json({ message: "Login successful", token, user });
  } catch (error) {
    console.error("Apple login error:", error);
    res.status(500).json({ message: "Authentication failed", error });
  }
});

export default router;
