import express from "express";
import authorization from "../../../middleware/authorization.js";
import upload from "../../../middleware/upload.js";
import prisma from "../../../prisma/client.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import deleteImage from "../../../utils/deleteImage.js";
import uploadImage from "../../../utils/uploadImage.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import onBoardingSchema from "../../../schemas/onBoarding.schema.js";

const router = express.Router();

router
  .route("/:id")
  .put(
    authorization({ roles: ["admin"] }),
    upload.single("image_url"),
    async (req, res) => {
      const lang = langReq(req);
      const id = Number(req.params.id);

      try {
        if (Number.isNaN(id)) {
          return res
            .status(400)
            .json({ message: getTranslation(lang, "invalid_id") });
        }

        // partial update schema (don't allow deleted_at from update endpoint)
        const schema = onBoardingSchema(lang).partial();

        const resultValidation = schema.safeParse(req.body);

        if (!resultValidation.success) {
          return res.status(400).json({
            message: resultValidation.error.issues[0].message,
            errors: resultValidation.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
            })),
          });
        }

        // only update non-deleted records
        const existing = await prisma.onBoarding.findUnique({
          where: { id },
        });

        if (!existing) {
          return res
            .status(404)
            .json({ message: getTranslation(lang, "onBoarding_notFound") });
        }

        const data = { ...resultValidation.data };

        // if new image uploaded, upload & delete old
        if (req.file) {
          const newImageUrl = await uploadImage(
            req.file,
            `/onboarding/${Date.now()}`,
          );

          data.image_url = newImageUrl;

          if (existing.image_url) {
            await deleteImage(existing.image_url);
          }
        }

        const onBoarding = await prisma.onBoarding.update({
          where: { id },
          data,
        });

        return res.status(200).json({
          onBoarding,
          message: getTranslation(lang, "onBoarding_success_updated"),
        });
      } catch (error) {
        console.error(error);
        return res.status(500).json({
          message: getTranslation(lang, "internalError"),
          error: error.message,
        });
      }
    },
  )

  // GET BY ID (hide soft-deleted)
  .get(async (req, res) => {
    const lang = langReq(req);
    const id = Number(req.params.id);

    try {
      if (Number.isNaN(id)) {
        return res
          .status(400)
          .json({ message: getTranslation(lang, "invalid_id") });
      }

      const data = new FeatureApi(req).filter({ id }).fields().data;

      // findFirst because we’re filtering (findUnique doesn’t accept where filters beyond unique)
      const onBoarding = await prisma.onBoarding.findUnique(data);

      if (!onBoarding) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "onBoarding_notFound") });
      }

      return res.status(200).json({
        onBoarding,
        message: getTranslation(lang, "success"),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  // SOFT DELETE
  .delete(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    const id = Number(req.params.id);

    try {
      if (Number.isNaN(id)) {
        return res
          .status(400)
          .json({ message: getTranslation(lang, "invalid_id") });
      }

      const { permanent_delete = false } = req.body;

      const existing = await prisma.onBoarding.findFirst({
        where: { id },
      });

      if (!existing) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "onBoarding_notFound") });
      }

      // PERMANENT DELETE
      if (permanent_delete === true) {
        await prisma.onBoarding.delete({
          where: { id },
        });

        if (existing.image_url) {
          await deleteImage(existing.image_url);
        }

        return res.status(200).json({
          message: getTranslation(lang, "onBoarding_success_delete"),
          type: "permanent",
        });
      }

      // SOFT DELETE (default)
      if (existing.deleted_at) {
        return res.status(409).json({
          message: getTranslation(lang, "onBoarding_already_deleted"),
        });
      }

      await prisma.onBoarding.update({
        where: { id },
        data: { deleted_at: new Date() },
      });

      // optional: keep or delete image on soft delete (your choice)
      if (existing.image_url) {
        await deleteImage(existing.image_url);
      }

      return res.status(200).json({
        message: getTranslation(lang, "onBoarding_success_delete"),
        type: "soft",
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
