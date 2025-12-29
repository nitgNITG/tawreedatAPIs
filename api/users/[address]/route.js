import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { z } from "zod";
import { checkUserExists } from "../../../utils/checkUserExists.js"; // <-- import

export const userAddressSchema = (lang) => {
  return z.object({
    name: z.string({
      required_error: getTranslation(lang, "address_name_required"),
    }),
    address: z.string({
      required_error: getTranslation(lang, "address_required"),
    }),
    lat: z.string({
      required_error: getTranslation(lang, "lat_required"),
    }),
    long: z.string({
      required_error: getTranslation(lang, "long_required"),
    }),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional(),
    notes: z.string().optional(),
    isDefault: z.boolean().optional(),
    buildingNo: z.string().optional(),
    floorNo: z.string().optional(),
    apartmentNo: z.string().optional(),
  });
};

const router = express.Router();

// GET all addresses
router
  .route("/:id/addresses")
  .get(authorization, async (req, res) => {
    const lang = langReq(req);
    const { id } = req.params;

    try {
      const user = req.user;
      if (user?.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const userExists = await checkUserExists(id);
      if (!userExists) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });
      }

      const data = new FeatureApi(req).fields().filter({ userId: id }).data;
      const addresses = await prisma.userAddress.findMany(data);

      return res
        .status(200)
        .json({ message: getTranslation(lang, "success"), addresses });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .post(authorization, async (req, res) => {
    const lang = langReq(req);
    const { id: userId } = req.params;

    try {
      const user = req.user;
      if (user.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const userExists = await checkUserExists(userId);
      if (!userExists) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });
      }

      const validation = userAddressSchema(lang).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0].message,
          errors: validation.error.issues,
        });
      }

      const data = validation.data;

      const existingCount = await prisma.userAddress.count({
        where: { userId },
      });
      const shouldBeDefault = data.isDefault === true || existingCount === 0;

      const address = await prisma.$transaction(async (tx) => {
        if (shouldBeDefault) {
          await tx.userAddress.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.userAddress.create({
          data: { ...data, userId, isDefault: shouldBeDefault },
        });
      });

      return res
        .status(201)
        .json({ message: getTranslation(lang, "success"), address });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

// GET, PUT, DELETE single address
router
  .route("/:id/addresses/:addressId")
  .get(authorization, async (req, res) => {
    const lang = langReq(req);
    const userId = req.params.id;
    const addressId = +req.params.addressId;

    try {
      const user = req.user;
      if (user?.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const userExists = await checkUserExists(userId);
      if (!userExists) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });
      }

      const data = new FeatureApi(req)
        .fields()
        .filter({ userId, id: addressId }).data;
      const address = await prisma.userAddress.findFirst(data);

      if (!address) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "address_not_found") });
      }

      return res
        .status(200)
        .json({ message: getTranslation(lang, "success"), address });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
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
      if (user.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const userExists = await checkUserExists(userId);
      if (!userExists) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });
      }

      const validation = userAddressSchema(lang).partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0].message,
          errors: validation.error.issues,
        });
      }

      const data = validation.data;

      const existingAddress = await prisma.userAddress.findFirst({
        where: { id: addressId, userId },
      });

      if (!existingAddress) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "address_not_found") });
      }

      const address = await prisma.$transaction(async (tx) => {
        if (data.isDefault === true) {
          await tx.userAddress.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.userAddress.update({ where: { id: addressId }, data });
      });

      return res
        .status(200)
        .json({ message: getTranslation(lang, "success"), address });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
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
      if (user?.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }

      const userExists = await checkUserExists(userId);
      if (!userExists) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "user_not_found") });
      }

      await prisma.userAddress.delete({ where: { id: addressId, userId } });

      return res.status(200).json({ message: getTranslation(lang, "success") });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
