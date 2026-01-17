import express from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import prisma from "../../../prisma/client.js";
import { db } from "../../../firebase/admin.js";
import pushNotification from "../../../utils/push-notification.js";
import { z } from "zod";

const router = express.Router();
const responseSchema = (lang) => {
  return z.object({
    response: z.string({ message: getTranslation(lang, "response_required") }),
  });
};

router
  .route("/:contactId")
  .get(authorization(), async (req, res) => {
    const lang = langReq(req);
    const id = +req.params.contactId;
    try {
      const user = req.user;
      if (user.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }
      const contact = await prisma.contactUs.findUnique({
        where: { id },
      });
      if (!contact) {
        return res.status(404).json({
          message: getTranslation(lang, "contact_not_found"),
        });
      }
      res
        .status(200)
        .json({ contact, message: getTranslation(lang, "success") });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization(), async (req, res) => {
    const id = +req.params.contactId;
    const lang = langReq(req);
    try {
      const user = req.user;
      if (user.role !== "admin") {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "not_allowed") });
      }
      await prisma.contactUs.delete({
        where: { id },
      });
      res.status(200).json({
        message: getTranslation(lang, "successfully_deleted_contact"),
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .put(authorization(), async (req, res) => {
    const lang = langReq(req);
    const id = +req.params.contactId;

    try {
      const isContact = await prisma.contactUs.findUnique({
        where: { id },
      });

      if (!isContact || isContact.read) {
        return res.status(404).json({
          message: getTranslation(lang, "contact_not_found"),
        });
      }
      const resultValidation = responseSchema(lang).safeParse(req.body);
      if (!resultValidation.success) {
        return res.status(400).json({
          message: resultValidation.error.issues[0].message,
          errors: resultValidation.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        });
      }
      const { response } = resultValidation.data;

      // Find contact message and update with response
      const contact = await prisma.contactUs.update({
        where: { id },
        data: {
          response,
          read: true,
        },
      });

      // Update Firebase
      const firebaseDoc = await db
        .collection("contact")
        .where("email", "==", contact.email)
        .where("createdAt", "==", contact.createdAt)
        .get();

      if (!firebaseDoc.empty) {
        await firebaseDoc.docs[0].ref.update({ response, read: true });
      }

      res.status(200).json({
        message: getTranslation(lang, "response_sent_success"),
        contact,
      });

      const user = await prisma.user.findUnique({
        where: { email: contact.email },
        select: {
          id: true,
          fcmToken: true,
          lang: true,
        },
      });
      if (user) {
        await pushNotification({
          key: {
            title: "Response to your Contact Message",
            desc: `Your response: ${response}`,
          },
          users: [user],
          lang,
          data: {
            navigate: "contact",
            route: "https://mail.google.com/mail/u",
          },
        });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });

export default router;
