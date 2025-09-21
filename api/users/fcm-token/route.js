import express from "express";
import prisma from "../../../prisma/client.js";
import getTranslation from "../../../middleware/getTranslation.js";
import authorization from "../../../middleware/authorization.js";
import admin, { db } from "../../../firebase/admin.js";

const router = express.Router();

router.post("/", authorization, async (req, res) => {
  const lang = req.query.lang || "en";
  try {
    const { fcmToken } = req.body;
    const user = req.user;
    if (!fcmToken) {
      return res.status(400).json({ message: "fcmToken is required" });
    }

    // Update user's FCM token
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        fcmToken,
      },
    });

    console.log(`🔄 Updated FCM token for user ${user.id}, ${fcmToken}`);

    res
      .status(201)
      .json({ message: getTranslation(lang, "successfully created fcm") });
    // Check for undelivered notifications in Firestore

    console.log(`Checking for undelivered notifications for user ${user.id}`);
    const undeliveredNotificationsSnapshot = await db
      .collection("Notifications")
      .where("userId", "==", user.id)
      .where("delivered", "==", false)
      .get();

    console.log(
      `Found ${undeliveredNotificationsSnapshot.size} undelivered notifications`
    );

    // Send undelivered notifications
    if (!undeliveredNotificationsSnapshot.empty) {
      const sendPromises = undeliveredNotificationsSnapshot.docs.map(
        async (doc) => {
          const notification = doc.data();
          console.log(`Attempting to resend notification ${doc.id}`);

          try {
            await admin.messaging().send({
              notification: {
                title: notification.title,
                body: notification.desc,
              },
              token: fcmToken,
              data: {
                route: notification.route || "/",
              },
            });

            // Mark as delivered
            await doc.ref.update({ delivered: true });
            console.log(`✅ Successfully resent notification ${doc.id}`);
            return true;
          } catch (error) {
            console.error(
              `❌ Failed to resend notification ${doc.id}:`,
              error.message
            );

            // If token is invalid, update user record again
            if (
              error.message ===
              "The registration token is not a valid FCM registration token"
            ) {
              await prisma.user.update({
                where: { id: user.id },
                data: { fcmToken: null },
              });
              console.log(`Removed invalid FCM token for user ${user.id}`);
              return false;
            }
            return false;
          }
        }
      );

      const results = await Promise.all(sendPromises);
      const successCount = results.filter((result) => result).length;

      console.log(undeliveredNotificationsSnapshot.size);
      console.log(successCount);

      return res.status(201).json({
        message: getTranslation(lang, "successfully created fcm"),
        undeliveredNotifications: undeliveredNotificationsSnapshot.size,
        successfullySent: successCount,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
