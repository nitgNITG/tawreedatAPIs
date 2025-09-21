import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { z } from "zod";

export const userAddressSchema = (lang) => {
  return z.object({
    address: z.string({ message: getTranslation(lang, "address_required") }),
    lat: z.string({ message: getTranslation(lang, "lat_required") }),
    long: z.string({ message: getTranslation(lang, "long_required") }),
  });
};
const router = express.Router();

router
  .route("/:id/addresses")
  .get(authorization, async (req, res) => {
    const lang = langReq(req);
    const { id } = req.params;
    try {
      const user = req.user;
      if (user?.role !== "ADMIN" && user?.id !== id)
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      const data = new FeatureApi(req).fields().filter({ userId: id }).data;
      const addresses = await prisma.userAddress.findMany(data);

      res
        .status(200)
        .json({ message: getTranslation(lang, "success"), addresses });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .post(authorization, async (req, res) => {
    const lang = langReq(req);
    const { id } = req.params;
    try {
      const user = req.user;

      if (user.role !== "ADMIN" && user.id !== id)
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      const resultValidation = userAddressSchema(lang).safeParse(req.body);
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
      const address = await prisma.userAddress.create({
        data: {
          userId: id,
          ...data,
        },
      });

      res
        .status(200)
        .json({ message: getTranslation(lang, "success"), address });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

router
  .route("/:id/addresses/:addressId")
  .get(authorization, async (req, res) => {
    const lang = langReq(req);
    const userId = req.params.id;
    const addressId = +req.params.addressId;
    try {
      const user = req.user;
      if (user?.role !== "ADMIN" && user?.id !== userId)
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      const data = new FeatureApi(req)
        .fields()
        .filter({ userId, id: addressId }).data;

      const address = await prisma.userAddress.findFirst(data);
      if (!address) {
        return res.status(404).json({
          message: getTranslation(lang, "address_not_found"),
        });
      }

      return res
        .status(200)
        .json({ message: getTranslation(lang, "success"), address });
    } catch (error) {
      console.error(error);
      return res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(authorization, async (req, res) => {
    const lang = langReq(req);
    const userId = req.params.id;
    const addressId = +req.params.addressId;
    try {
      const user = req.user;

      if (user.role !== "ADMIN" && user.id !== userId)
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      const resultValidation = userAddressSchema(lang)
        .optional()
        .safeParse(req.body);
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
      const address = await prisma.userAddress.update({
        where: { id: addressId },
        data,
      });

      res
        .status(200)
        .json({ message: getTranslation(lang, "success"), address });
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
    const userId = req.params.id;
    const addressId = +req.params.addressId;
    try {
      const user = req.user;
      if (user?.role !== "ADMIN" && user?.id !== userId)
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });

      await prisma.userAddress.delete({
        where: { id: addressId },
      });

      return res.status(200).json({ message: getTranslation(lang, "success") });
    } catch (error) {
      console.error(error);
      return res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
