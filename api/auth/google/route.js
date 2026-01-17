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
        process.env.GOOGLE_FLUTTER_APPLE_CLIENT_ID,
      ],
    });
    const payload = ticket.getPayload();
    const email = payload.email;
    const full_name = payload.name;
    const image_url = payload.picture;

    console.log("payload", JSON.stringify(payload, null, 2));

    if (!email) {
      return res.status(400).json({ message: "Invalid Google token" });
    }

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    console.log("user exist", JSON.stringify(user, null, 2));

    if (!user) {
      //firebase authentication
      const firebaseUser = await auth.createUser({
        displayName: full_name,
        email,
        password: "123456",
      });
      // Create new user
      user = await prisma.user.create({
        data: {
          id: firebaseUser.uid,
          email,
          full_name,
          image_url,
          login_type: "GOOGLE",
          role: {
            connect: {
              name: "admin",
            },
          },
        },
        include: {
          role: {
            select: {
              name: true,
            },
          },
        },
      });
      console.log("user new", JSON.stringify(user, null, 2));
    }

    // Generate JWT
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role.name,
      },
      process.env.SECRET_KEY
      // { expiresIn: process.env.JWT_EXPIRY || "7d" }
    );
    console.log("Generated JWT:", token);

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        ...user,
        role: user.role.name,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    res.status(500).json({ message: "Authentication failed", error });
  }
});

export default router;
