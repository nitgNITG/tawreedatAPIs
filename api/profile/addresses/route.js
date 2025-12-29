import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { z } from "zod";

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
  });
};

const router = express.Router();

router
  .route("/")
  .get(authorization, async (req, res) => {
    const lang = langReq(req);
    try {
      const userId = req.user.id;
      const data = new FeatureApi(req).fields().filter({ userId }).data;
      const addresses = await prisma.userAddress.findMany(data);

      res
        .status(200)
        .json({ message: getTranslation(lang, "success"), addresses });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .post(authorization, async (req, res) => {
    const lang = langReq(req);

    try {
      const userId = req.user.id;
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
          data: {
            ...data,
            userId,
            isDefault: shouldBeDefault,
          },
        });
      });

      return res.status(201).json({
        message: getTranslation(lang, "success"),
        address,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

router
  .route("/:addressId")
  .get(authorization, async (req, res) => {
    const lang = langReq(req);
    const addressId = +req.params.addressId;
    try {
      const userId = req.user.id;
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
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(authorization, async (req, res) => {
    const lang = langReq(req);
    const addressId = +req.params.addressId;

    try {
      const userId = req.user.id;
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
        return res.status(404).json({
          message: getTranslation(lang, "address_not_found"),
        });
      }

      const address = await prisma.$transaction(async (tx) => {
        if (data.isDefault === true) {
          await tx.userAddress.updateMany({
            where: { userId, isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.userAddress.update({
          where: { id: addressId },
          data,
        });
      });

      return res.status(200).json({
        message: getTranslation(lang, "success"),
        address,
      });
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
    const addressId = +req.params.addressId;
    try {
      const userId = req.user.id;
      const address = await prisma.userAddress.findFirst({
        where: { id: addressId, userId },
      });

      if (!address) {
        return res.status(404).json({
          message: getTranslation(lang, "address_not_found"),
        });
      }

      await prisma.userAddress.delete({
        where: { id: addressId },
      });

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
