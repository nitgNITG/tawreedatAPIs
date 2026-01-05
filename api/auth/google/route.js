import express from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import prisma from "../../../prisma/client.js";
import { auth } from "../../../firebase/admin.js";

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
        process.env.GOOGLE_WEB_FLUTTER_CLIENT_ID,
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
      //firebase authentication
      const firebaseUser = await auth.createUser({
        displayName: fullname,
        email,
        password: "123456",
      });
      // Create new user
      user = await prisma.user.create({
        data: {
          id: firebaseUser.uid,
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
      process.env.SECRET_KEY,
      { expiresIn: process.env.JWT_EXPIRY || "7d" }
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
