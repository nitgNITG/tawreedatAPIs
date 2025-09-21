import express from "express";
import authorization from "../../../../middleware/authorization.js";
import getTranslation, {
  langReq,
} from "../../../../middleware/getTranslation.js";
import admin, { db } from "../../../../firebase/admin.js";
import prisma from "../../../../prisma/client.js";
import { getNotificationsData, transformNotificationData } from "../route.js";
import { z } from "zod";
import { handleCSVDownload } from "../../../../utils/download-handlers/csv-handler.js";
import { handlePDFDownload } from "../../../../utils/download-handlers/pdf-handler.js";
import { formatData } from "../../../download/route.js";

const downloadSchema = z.object({
  fileType: z.enum(["csv", "pdf"]),
});

const router = express.Router();
export const formatNotificationsData = (notifications, lang) => {
  return notifications.map((notification) => {
    const titleField = lang === "ar" ? "titleAr" : "title";
    const descField = lang === "ar" ? "descAr" : "desc";
    const yes = lang === "ar" ? "نعم" : "Yes";
    const no = lang === "ar" ? "لا" : "No";
    const readText = notification.read ? yes : no;

    return {
      id: notification.id,
      title: notification[titleField] || notification.title || "",
      desc: notification[descField] || notification.desc || "",
      read: readText,
      user: notification.userId || "",
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  });
};

router.route("/delete-all").delete(authorization, async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;

    if (!user) {
      return res
        .status(401)
        .json({ message: getTranslation(lang, "unauthorized") });
    }

    const isAdmin = user.role === "ADMIN";
    let userId;

    if (isAdmin && req.query.userId) {
      userId = req.query.userId;
    } else {
      userId = user.id;
    }

    // Get all notifications for the user
    const notificationsSnapshot = await db
      .collection("Notifications")
      .where("userId", "==", userId)
      .get();

    // Check if there are any notifications
    if (notificationsSnapshot.empty) {
      return res.status(200).json({
        message: getTranslation(lang, "no_notifications_to_delete"),
      });
    }

    // Delete all notifications in batches (Firestore has a limit of 500 operations per batch)
    const batchSize = 450; // Leave some room for other operations
    let batch = db.batch();
    let operationCount = 0;
    let totalDeleted = 0;

    for (const doc of notificationsSnapshot.docs) {
      batch.delete(doc.ref);
      operationCount++;
      totalDeleted++;

      // If we reach the batch limit, commit and create a new batch
      if (operationCount >= batchSize) {
        await batch.commit();
        batch = db.batch();
        operationCount = 0;
      }
    }

    // Commit any remaining operations
    if (operationCount > 0) {
      await batch.commit();
    }

    return res.status(200).json({
      message: getTranslation(lang, "notifications_deleted"),
      count: totalDeleted,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});
router.route("/download").post(authorization, async (req, res) => {
  try {
    const lang = langReq(req);
    const user = req.user;
    const { fileType } = await downloadSchema.parseAsync(req.body);

    if (!user) {
      return res
        .status(401)
        .json({ message: getTranslation(lang, "unauthorized") });
    }

    const isAdmin = user.role === "ADMIN";
    let userId;

    if (isAdmin) {
      userId = req.query.userId || user.id;
    } else {
      userId = user.id;
    }

    const { keyword = "", ...filters } = req.query;

    const notifications = await getNotificationsData({
      userId,
      keyword,
      filters,
      lang,
      limit: 0, // Get all notifications for download
      skip: 0,
    });

    if (!notifications.length) {
      return res
        .status(404)
        .json({ error: "No data found matching the criteria" });
    }

    const data = formatNotificationsData(notifications, lang);
    const formattedData = formatData(data, lang);

    const title = lang === "en" ? "Notifications" : "الإشعارات";

    if (fileType === "csv") {
      return handleCSVDownload(formattedData, "notificationsReport", lang, res);
    }

    if (fileType === "pdf") {
      return handlePDFDownload(
        formattedData,
        "notificationsReport",
        title,
        {},
        lang,
        res
      );
    }
  } catch (error) {
    console.error("Error downloading notifications:", error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});
router
  .route("/:id")
  .patch(authorization, async (req, res) => {
    const lang = langReq(req);
    const { id } = req.params;

    try {
      const user = req.user;
      if (!user) {
        return res
          .status(401)
          .json({ message: getTranslation(lang, "unauthorized") });
      }

      const notificationDoc = await db
        .collection("Notifications")
        .doc(id)
        .get();
      if (!notificationDoc.exists) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "notification_not_found") });
      }

      const notification = transformNotificationData(notificationDoc);
      const isAdmin = user.role === "ADMIN";
      if (!isAdmin && notification.userId !== user.id) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "forbidden") });
      }
      if (notification.read) {
        return res
          .status(400)
          .json({ message: getTranslation(lang, "notification_already_read") });
      }

      await db.collection("Notifications").doc(id).update({
        read: true,
        updatedAt: new Date(),
      });

      return res
        .status(200)
        .json({ message: getTranslation(lang, "notification_updated") });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  })
  .delete(authorization, async (req, res) => {
    const lang = langReq(req);
    const { id } = req.params;

    try {
      const user = req.user;
      if (!user) {
        return res
          .status(401)
          .json({ message: getTranslation(lang, "unauthorized") });
      }

      const notificationDoc = await db
        .collection("Notifications")
        .doc(id)
        .get();
      if (!notificationDoc.exists) {
        return res
          .status(404)
          .json({ message: getTranslation(lang, "notification_not_found") });
      }

      const notification = transformNotificationData(notificationDoc);
      const isAdmin = user.role === "ADMIN";
      if (!isAdmin && notification.userId !== user.id) {
        return res
          .status(403)
          .json({ message: getTranslation(lang, "forbidden") });
      }

      await db.collection("Notifications").doc(id).delete();
      return res
        .status(200)
        .json({ message: getTranslation(lang, "notification_deleted") });
    } catch (error) {
      console.error(error);
      res.status(500).json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
    }
  });
router.route("/:id/resend").post(authorization, async (req, res) => {
  const lang = langReq(req);
  const { id } = req.params;

  try {
    const user = req.user;
    if (!user) {
      return res
        .status(401)
        .json({ message: getTranslation(lang, "unauthorized") });
    }

    if (user.role !== "ADMIN") {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "forbidden") });
    }

    const notificationDoc = await db.collection("Notifications").doc(id).get();
    if (!notificationDoc.exists) {
      return res
        .status(404)
        .json({ message: getTranslation(lang, "notification_not_found") });
    }

    const notification = transformNotificationData(notificationDoc);
    const targetUser = await prisma.user.findUnique({
      where: { id: notification.userId },
      select: { id: true, fcmToken: true },
    });

    if (!targetUser) {
      return res
        .status(404)
        .json({ message: getTranslation(lang, "user_not_found") });
    }

    if (!targetUser.fcmToken) {
      return res
        .status(404)
        .json({ message: getTranslation(lang, "fcmToken_not_found") });
    }

    const notificationRef = await db.collection("Notifications").add({
      userId: targetUser.id,
      title: notification.title,
      titleAr: notification.titleAr,
      desc: notification.desc,
      descAr: notification.descAr,
      createdAt: new Date(Date.now()),
      read: false,
      delivered: true,
      route: notification.route || "/",
    });

    res.status(200).json({
      message: getTranslation(lang, "notification_resent_successfully"),
    });

    try {
      await admin.messaging().send({
        notification: {
          title: notification.title,
          body: notification.desc,
        },
        token: targetUser.fcmToken,
        data: {
          route: notification.route || "/",
        },
      });
    } catch (fcmError) {
      if (
        fcmError.message ===
          "The registration token is not a valid FCM registration token" ||
        fcmError.code === "messaging/registration-token-not-registered"
      ) {
        console.warn(`Invalid token detected: ${targetUser.fcmToken}`);

        // Update user's FCM token
        await prisma.user.update({
          where: { id: targetUser.id },
          data: { fcmToken: null },
        });

        // Update notification delivered status
        await notificationRef.update({ delivered: false });
      }
      throw fcmError; // Re-throw to be caught by outer catch block
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
