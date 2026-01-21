import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import { ensureCustomerOr404 } from "../../../utils/checkUserExists.js"; // <-- import
import { customerAddressSchema } from "../../../schemas/user_address.schema.js";

const router = express.Router();

// GET all addresses
router
  .route("/:id/addresses")
  .get(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    const { id: userId } = req.params;

    try {
      // ✅ must be customer
      const customerCheck = await ensureCustomerOr404(lang, userId);
      if (!customerCheck.ok) {
        return res
          .status(customerCheck.status)
          .json({ message: customerCheck.message });
      }

      // FeatureApi filter now uses customer_id
      const data = new FeatureApi(req)
        .fields()
        .filter({ customer_id: userId }).data;

      const addresses = await prisma.customerAddress.findMany(data);

      return res.status(200).json({
        message: getTranslation(lang, "success"),
        addresses,
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })

  .post(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    const { id: userId } = req.params;

    try {
      // ✅ must be customer
      const customerCheck = await ensureCustomerOr404(lang, userId);
      if (!customerCheck.ok) {
        return res
          .status(customerCheck.status)
          .json({ message: customerCheck.message });
      }

      const validation = customerAddressSchema(lang).safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0].message,
          errors: validation.error.issues,
        });
      }

      const data = validation.data;

      const existingCount = await prisma.customerAddress.count({
        where: { customer_id: userId },
      });

      const shouldBeDefault = data.is_default === true || existingCount === 0;

      const address = await prisma.$transaction(async (tx) => {
        if (shouldBeDefault) {
          await tx.customerAddress.updateMany({
            where: { customer_id: userId, is_default: true },
            data: { is_default: false },
          });
        }

        return tx.customerAddress.create({
          data: {
            ...data,
            customer_id: userId,
            is_default: shouldBeDefault,
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

// GET, PUT, DELETE single address
router
  .route("/:id/addresses/:addressId")
  .get(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    const userId = req.params.id;
    const addressId = Number(req.params.addressId);

    try {
      const customerCheck = await ensureCustomerOr404(lang, userId);
      if (!customerCheck.ok) {
        return res
          .status(customerCheck.status)
          .json({ message: customerCheck.message });
      }

      const data = new FeatureApi(req)
        .fields()
        .filter({ customer_id: userId, id: addressId }).data;

      const address = await prisma.customerAddress.findFirst(data);

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

  .put(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    const userId = req.params.id;
    const addressId = Number(req.params.addressId);

    try {
      const customerCheck = await ensureCustomerOr404(lang, userId);
      if (!customerCheck.ok) {
        return res
          .status(customerCheck.status)
          .json({ message: customerCheck.message });
      }

      const validation = customerAddressSchema(lang)
        .partial()
        .safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          message: validation.error.issues[0].message,
          errors: validation.error.issues,
        });
      }

      const data = validation.data;

      const existingAddress = await prisma.customerAddress.findFirst({
        where: { id: addressId, customer_id: userId },
      });

      if (!existingAddress) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "address_not_found") });
      }

      const address = await prisma.$transaction(async (tx) => {
        if (data.is_default === true) {
          await tx.customerAddress.updateMany({
            where: { customer_id: userId, is_default: true },
            data: { is_default: false },
          });
        }

        return tx.customerAddress.update({
          where: { id: addressId },
          data,
        });
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

  .delete(authorization({ roles: ["admin"] }), async (req, res) => {
    const lang = langReq(req);
    const userId = req.params.id;
    const addressId = Number(req.params.addressId);
    try {
      const customerCheck = await ensureCustomerOr404(lang, userId);
      if (!customerCheck.ok) {
        return res
          .status(customerCheck.status)
          .json({ message: customerCheck.message });
      }

      // ✅ NOTE: Prisma delete needs unique selector (id only), so verify ownership first
      const existingAddress = await prisma.customerAddress.findFirst({
        where: { id: addressId, customer_id: userId },
        select: { id: true },
      });

      if (!existingAddress) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "address_not_found") });
      }

      await prisma.customerAddress.delete({ where: { id: addressId } });

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
