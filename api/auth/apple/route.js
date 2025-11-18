import express from "express";
import jwt from "jsonwebtoken";
import prisma from "../../../prisma/client.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import * as jose from "jose";

const router = express.Router();

/**
 * Verifies the Apple ID token using Apple's JWKS.
 * @param {string} idToken - The ID token from Apple.
 * @param {string} clientId - Your app's client_id (service ID).
 * @param {string} [nonce] - Optional nonce if used in your sign-in flow.
 * @returns {Promise<Object>} - The decoded JWT claims.
 */
export const verifyAppleToken = async ({ idToken, clientId, nonce }) => {
  // Apple’s JWKS URL
  const JWKS_URL = "https://appleid.apple.com/auth/keys";

  // Create JWKS client
  const JWKS = jose.createRemoteJWKSet(new URL(JWKS_URL));

  // Verify the JWT
  const { payload } = await jose.jwtVerify(idToken, JWKS, {
    issuer: "https://appleid.apple.com",
    audience: clientId, // must match your Apple service ID
  });

  // if (nonce && payload.nonce && payload.nonce !== nonce) {
  //   throw new Error("Nonce mismatch");
  // }

  return payload;
};

router.post("/verify", async (req, res) => {
  try {
    const lang = langReq(req);
    const { idToken, fullname } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Missing Apple ID token" });
    }

    // Verify the Apple token
    const jwtClaims = await verifyAppleToken({
      idToken,
      clientId: process.env.AUTH_APPLE_ID,
      // nonce,
    });
    console.log(jwtClaims);

    /**
     * @type {string}
     */
    const appleId = jwtClaims.sub;
    /**
     * @type {string?}
     */
    const email = jwtClaims.email;

    if (!appleId) {
      return res.status(400).json({ message: "Invalid Apple token" });
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { ...(email ? { email } : { appleId }) },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          fullname: fullname || "Apple User",
          loginType: "APPLE",
          appleId, // optional but recommended
        },
      });
    }

    // Create app JWT
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      process.env.SECRET_KEY,
      { expiresIn: "7d" }
    );

    console.log("✅ Apple login successful for:", email);

    res.status(200).json({
      message: "Login successful",
      token,
      user,
    });
  } catch (error) {
    console.error("❌ Apple login error:", error);
    res.status(401).json({
      message: "Invalid Apple token",
      error: error.message || error,
    });
  }
});

export default router;
