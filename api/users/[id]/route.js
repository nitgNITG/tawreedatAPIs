import express from "express";
import bcrypt from "bcrypt";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import upload from "../../../middleware/upload.js";
import uploadImage from "../../../utils/uploadImage.js";
import deleteImage from "../../../utils/deleteImage.js";
import { userSchema } from "../route.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();

router
  .route("/:id")
  .get(authorization, async (req, res) => {
    const lang = langReq(req);

    const { id } = req.params;
    try {
      const admin = req.user;
      if (admin?.role !== "ADMIN")
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      const data = new FeatureApi(req).fields().filter({ id }).data;

      const user = await prisma.user.findUnique(data);

      delete user.password;
      delete user.fcmToken;

      res.status(200).json({ message: getTranslation(lang, "success"), user });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(authorization, upload.single("imageUrl"), async (req, res) => {
    const lang = langReq(req);
    const { id } = req.params;
    try {
      const admin = req.user;

      if (admin.role !== "ADMIN")
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      const resultValidation = userSchema(lang).partial().safeParse(req.body);
      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        });
      }
      const data = resultValidation.data;
      // hash password
      const isUser = await prisma.user.findUnique({
        where: { id },
      });

      if (!isUser)
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });

      if (data.phone) {
        const isPhone = await prisma.user.findFirst({
          where: { phone: data.phone, AND: { NOT: { id } } },
        });
        if (isPhone)
          return res
            .status(400)
            .json({ message: getTranslation(lang, "phone_already_used") });
      }
      if (data.email) {
        const isEmail = await prisma.user.findFirst({
          where: { email: data.email, AND: { NOT: { id } } },
        });
        if (isEmail)
          return res
            .status(400)
            .json({ message: getTranslation(lang, "email_already_used") });
      }
      if (data.password) {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        data.password = hashedPassword;
      }

      // Prepare update data with only changed fields
      const updateData = {};

      // Check each field for changes
      for (const key in data) {
        if (data[key] !== isUser[key] && data[key] !== undefined) {
          updateData[key] = data[key];
        }
      }

      // Handle image upload
      if (req.file) {
        const imageUrl = await uploadImage(req.file, `/users/${Date.now()}`);
        updateData.imageUrl = imageUrl;
        await deleteImage(isUser.imageUrl);
      }

      // Handle image deletion
      if (data.deleteImage && !req.file) {
        await deleteImage(isUser.imageUrl);
        updateData.imageUrl = null;
        delete updateData.deleteImage; // Remove this from update data
      }

      // Only update if there are actual changes
      let user = isUser;
      if (Object.keys(updateData).length > 0) {
        user = await prisma.user.update({
          where: { id },
          data: updateData,
        });
      }
      delete user.password;
      delete user.fcmToken;
      res.status(200).json({ message: getTranslation(lang, "success"), user });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization, async (req, res) => {
    const lang = langReq(req);
    const archived = req.query.archived || false;
    const { id } = req.params;
    try {
      const admin = req.user;
      if (admin?.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }
      const isUser = await prisma.user.findUnique({ where: { id } });
      if (!isUser)
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });

      if (archived) {
        await prisma.user.update({
          where: {
            id: id,
          },
          data: {
            isDeleted: true,
          },
        });
        return res.status(200).json({
          message: getTranslation(lang, "user_archived"),
        });
      }
      // Delete all related records in a transaction
      await prisma.user.delete({
        where: { id },
      });
      res.status(200).json({ message: getTranslation(lang, "user_deleted") });
      await deleteImage(isUser.imageUrl);
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
