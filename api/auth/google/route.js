import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../../../prisma/client.js";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

const router = express.Router();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/api/auth/google/callback`,
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
              loginType: "GOOGLE",
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

router.get("/", (req, res, next) => {
  const redirect =
    req.query.redirect || process.env.FRONTEND_URL || "http://localhost:3000";

  passport.authenticate("google", {
    scope: ["email", "profile"],
    state: redirect,
  })(req, res, next);
});
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
//     const redirectUrl =
//       req.query.state || process.env.FRONTEND_URL || "http://localhost:3000";

//     // if (redirectUrl.startsWith("http") || redirectUrl.startsWith("https")) {
//     //   // res.cookie("token", token, {
//     //   //   maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
//     //   // });

//     //   return res.redirect(req.query.state);
//     // }
//     res.json({message: "Login successful", token });
//     // res.redirect(`${req.query.state}?token=${token}`);
//   }
// );

router.get(
  "/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/",
  }),
  (req, res) => {
    const token = jwt.sign(
      {
        userId: req.user.id,
        role: req.user.role,
      },
      process.env.SECRET_KEY,
      { expiresIn: process.env.JWT_EXPIRY || "7d" }
    );
    console.log(token);

    // Send an HTML page with JavaScript that will post a message to the parent window
    res.send(`
      <html>
        <body>
          <script>
            // Send the token to the parent window
            window.opener.postMessage(
              { 
                message: "Login successful", 
                token: "${token}" 
              }, 
              "${process.env.FRONTEND_URL || "http://localhost:3000"}"
            );
            // Close this popup window
            window.close();
          </script>
          <p>Authentication successful! This window will close automatically.</p>
        </body>
      </html>
    `);
  }
);

export default router;
