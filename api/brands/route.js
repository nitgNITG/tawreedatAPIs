import { Router } from "express";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";
import FeatureApi from "../../utils/FetchDataApis.js";
import prisma from "../../prisma/client.js";
import authorization from "../../middleware/authorization.js";
import upload from "../../middleware/upload.js";
import uploadImage from "../../utils/uploadImage.js";
import {
  createBrandSchema,
  deleteBrandsSchema,
} from "../../schemas/brand.schema.js";
import deleteImage from "../../utils/deleteImage.js";

const router = Router();

// Get all routes
router
  .route("/")
  .get(async (req, res) => {
    const lang = langReq(req);
    try {
      const data = new FeatureApi(req)
        .fields()
        .filter()
        .skip()
        .sort()
        .limit(10)
        .keyword(["name", "nameAr", "sku", "barcode"], "OR").data;

      const totalBrands = await prisma.brand.count({ where: data.where });
      const brands = await prisma.brand.findMany(data);
      const totalPages = Math.ceil(totalBrands / (parseInt(data.take) || 10));

      res.status(200).json({ brands, totalPages, totalBrands });
    } catch (error) {
      console.error(error.message);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .post(
    authorization,
    upload.fields([{ name: "logoUrl" }, { name: "coverUrl" }]),
    async (req, res) => {
      const lang = langReq(req);
      try {
        const admin = req.user;
        if (admin?.role !== "ADMIN") {
          return res
            .status(403)
            .json({ message: getTranslation(lang, "not_allowed") });
        }
        const query = new FeatureApi(req).fields().data;

        const resultValidation = createBrandSchema(lang).safeParse(req.body);

        if (!resultValidation.success) {
          console.log("Validation failed:", resultValidation.error);

          return res.status(400).json({
            message: resultValidation.error.issues[0].message,
            errors: resultValidation.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          });
        }

        const data = resultValidation.data;
        const cover = req.files["coverUrl"]?.[0];
        const logo = req.files["logoUrl"]?.[0];
        if (cover) {
          data.coverUrl = await uploadImage(cover, `/brands`);
        }
        if (logo) {
          data.logoUrl = await uploadImage(logo, `/brands`);
        }

        const brand = await prisma.brand.create({
          data,
          ...(query ?? {}),
        });

        res.status(201).json({
          message: getTranslation(lang, "created_successfully"),
          brand,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          message: getTranslation(lang, "internalError"),
          error: error.message,
        });
      }
    }
  )
  .delete(authorization, async (req, res) => {
    const lang = langReq(req);
    try {
      const admin = req.user;
      if (admin?.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }
      const resultValidation = deleteBrandsSchema(lang).safeParse(req.body);

      if (!resultValidation.success) {
        console.log("Validation failed:", resultValidation.error);
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        });
      }
      const data = resultValidation.data;

      if (data.isDeleted) {
        const brands = await prisma.brand.findMany({
          where: { isDeleted: true },
          select: { coverUrl: true, logoUrl: true },
        });
        for (const brand of brands) {
          await deleteImage(brand.coverUrl);
          await deleteImage(brand.logoUrl);
        }
        const count = await prisma.brand.deleteMany({
          where: { isDeleted: true },
        });
        return res.status(200).json({
          message: getTranslation(lang, "deleted_successfully"),
          count,
        });
      }
      if (data.notActive) {
        const brands = await prisma.brand.findMany({
          where: { isActive: false },
          select: { coverUrl: true, logoUrl: true },
        });
        for (const brand of brands) {
          await deleteImage(brand.coverUrl);
          await deleteImage(brand.logoUrl);
        }
        const count = await prisma.brand.deleteMany({
          where: { isActive: false },
        });
        return res.status(200).json({
          message: getTranslation(lang, "deleted_successfully"),
          count,
        });
      }
      if (data.ids && data.permanent) {
        const brands = await prisma.brand.findMany({
          where: { id: { in: data.ids } },
          select: { coverUrl: true, logoUrl: true },
        });
        for (const brand of brands) {
          await deleteImage(brand.coverUrl);
          await deleteImage(brand.logoUrl);
        }
        const count = await prisma.brand.deleteMany({
          where: { id: { in: data.ids } },
        });
        return res.status(200).json({
          message: getTranslation(lang, "deleted_successfully"),
          count,
        });
      }
      const count = await prisma.brand.updateMany({
        where: { id: { in: data.ids } },
        data: { isDeleted: true, isActive: false },
      });
      return res.status(200).json({
        message: getTranslation(lang, "deleted_successfully"),
        count,
      });
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

export default router;
