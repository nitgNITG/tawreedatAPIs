import jwt from "jsonwebtoken";
import { z } from "zod";
import getTranslation from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
const orderRedirect = (lang) => {
  return z.object({
    amount: z.number({ message: getTranslation(lang, "invalid_amount") }),
  });
};

export const redirectPayment = async (req, res) => {
  const lang = req.query.lang || "en";
  try {
    const bearerToken = req.headers.authorization;
    if (!bearerToken || !bearerToken.includes("Bearer ")) {
      return res
        .status(401)
        .json({ message: getTranslation(lang, "not_allowed") });
    }

    const resultValidation = orderRedirect(lang).safeParse(req.body);
    if (!resultValidation.success) {
      return res.status(400).json({
        message: resultValidation.error.errors[0].message,
        errors: resultValidation.error.errors,
      });
    }

    const data = resultValidation.data;
    const verifyToken = bearerToken.split(" ")[1];
    const decode = jwt.verify(verifyToken, process.env.BRAND_JWT_SECRET);
    if (!decode) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "not_allowed") });
    }
    const token = await prisma.brandToken.findUnique({
      where: {
        token: verifyToken,
      },
    });
    if (!token) {
      return res
        .status(401)
        .json({ message: getTranslation(lang, "token_expired") });
    }
    if (token.expired) {
      return res
        .status(401)
        .json({ message: getTranslation(lang, "token_expired") });
    }
    const brand = await prisma.brand.findUnique({
      where: { id: token.brandId },
    });
    if (!brand) {
      return res
        .status(404)
        .json({ message: getTranslation(lang, "brand_not_found") });
    }
    if (new Date(brand.validTo) < new Date()) {
      return res
        .status(401)
        .json({ message: getTranslation(lang, "brand_expired") });
    }
    const orderSessionPayment = await prisma.brandOrderSession.create({
      data: {
        brandTokenId: token.id,
        amount: data.amount,
      },
    });
    // const redirectUrl = `http://localhost:3000/ar/paypoins/${orderSessionPayment.id}`;
    const redirectUrl = `https://www.paypoins.com/ar/paypoins/${orderSessionPayment.id}`;

    return res
      .status(200)
      .json({ message: getTranslation(lang, "success"), redirectUrl });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
};
