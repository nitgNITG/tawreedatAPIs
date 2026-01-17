import admin, { db } from "../firebase/admin.js";
import getTranslation from "../middleware/getTranslation.js";
import prisma from "../prisma/client.js";

const pushNotification = async ({
  key,
  users,
  adminUserId,
  args,
  lang = "ar",
  data = {
    route: "/",
    navigate: "home",
  },
  sendToAdmins = true,
}) => {
  try {
    if (users?.length) {
      await Promise.all(
        users.map(async (user) => {
          const notificationRef = await db.collection("Notifications").add({
            userId: user.id,
            title: getTranslation("en", key?.title, args?.title),
            titleAr: getTranslation("ar", key?.title, args?.title),
            desc: getTranslation("en", key?.desc, args?.desc),
            descAr: getTranslation("ar", key?.desc, args?.desc),
            createdAt: new Date(Date.now()),
            read: false,
            data,
            delivered: !!user.fcm_token,
          });

          data.notificationId = notificationRef.id;

          if (user.fcm_token) {
            try {
              await admin.messaging().send({
                notification: {
                  title: getTranslation(
                    user.lang === "EN" ? "en" : "ar",
                    key?.title,
                    args?.title
                  ),
                  body: getTranslation(
                    user.lang === "EN" ? "en" : "ar",
                    key?.desc,
                    args?.desc
                  ),
                },
                token: user.fcm_token,
                data,
              });
            } catch (error) {
              if (
                error.message ===
                  "The registration token is not a valid FCM registration token" ||
                error.code === "messaging/registration-token-not-registered"
              ) {
                console.warn(`Invalid token detected: ${user.fcm_token}`);

                // Remove the invalid token from the database
                await prisma.user.update({
                  where: { id: user.id },
                  data: { fcm_token: null },
                });
                await notificationRef.update({ delivered: false });
              } else {
                console.error("Error sending notification:", error.message);
              }
            }
          }
        })
      );
    }

    if (sendToAdmins) {
      let userIds = users?.map((u) => u.id) || [];
      console.log(adminUserId);
      if (adminUserId && !userIds.includes(adminUserId))
        userIds.push(adminUserId);

      // If adminUserId is provided and not already in userIds, add it to the admin list
      const where = {
        role: { name: "admin" },
        id: {
          notIn: userIds,
        },
      };

      const admins = await prisma.user.findMany({
        where,
        select: {
          id: true,
          fcm_token: true,
          lang: true,
        },
      });

      // Send notifications to admins
      await Promise.all(
        admins.map(async (user) => {
          const notificationRef = await db.collection("Notifications").add({
            userId: user.id,
            title: getTranslation("en", key?.title, args?.title),
            titleAr: getTranslation("ar", key?.title, args?.title),
            desc: getTranslation("en", key?.desc, args?.desc),
            descAr: getTranslation("ar", key?.desc, args?.desc),
            createdAt: new Date(Date.now()),
            read: false,
            data,
            delivered: !!user.fcm_token,
          });

          data.notificationId = notificationRef.id;

          // Send notification to admin
          if (user.fcm_token) {
            const title = getTranslation(
              user.lang === "EN" ? "en" : "ar",
              key?.title,
              args?.title
            );
            const body = getTranslation(
              user.lang === "EN" ? "en" : "ar",
              key?.desc,
              args?.desc
            );

            try {
              await admin.messaging().send({
                notification: {
                  title,
                  body,
                },
                data,
                token: user.fcm_token,
              });
            } catch (error) {
              if (
                error.message ===
                  "The registration token is not a valid FCM registration token" ||
                error.code === "messaging/registration-token-not-registered"
              ) {
                console.warn(`Invalid admin token detected: ${user.fcm_token}`);

                // Remove the invalid token from the database
                await prisma.user.update({
                  where: { id: user.id },
                  data: { fcm_token: null },
                });
                await notificationRef.update({ delivered: false });
              } else {
                console.error(
                  "Error sending admin notification:",
                  error.message
                );
              }
            }
          }
        })
      );
    }
  } catch (error) {
    // Log the error for debugging purposes
    console.error("Error in pushNotification:", error);
    console.error("Push notification error:", error.message);
  }
};

export default pushNotification;
