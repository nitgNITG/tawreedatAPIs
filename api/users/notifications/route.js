import express from "express";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import { db } from "../../../firebase/admin.js";
import prisma from "../../../prisma/client.js";
import pushNotification from "../../../utils/push-notification.js";

const router = express.Router();

export const transformNotificationData = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() || data.createdAt,
    updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
  };
};

export const getNotificationsData = async ({
  userId,
  keyword,
  filters,
  lang,
  limit = 0,
  skip = 0,
}) => {
  let notificationsQuery = db.collection("Notifications");

  if (userId) {
    notificationsQuery = notificationsQuery.where("userId", "==", userId);
  }

  if (filters.createdAt) {
    if (filters.createdAt["gte"]) {
      notificationsQuery = notificationsQuery.where(
        "createdAt",
        ">=",
        new Date(filters.createdAt["gte"])
      );
    }
    if (filters.createdAt["lte"]) {
      notificationsQuery = notificationsQuery.where(
        "createdAt",
        "<=",
        new Date(filters.createdAt["lte"])
      );
    }
  }

  if (keyword) {
    const titleField = lang === "ar" ? "titleAr" : "title";
    notificationsQuery = notificationsQuery
      .where(titleField, ">=", keyword)
      .where(titleField, "<=", keyword + "\uf8ff")
      .orderBy(titleField);
  }

  if (!keyword)
    notificationsQuery = notificationsQuery.orderBy("createdAt", "desc");

  // Apply pagination only if limit > 0
  if (limit > 0) {
    notificationsQuery = notificationsQuery.limit(+limit).offset(+skip);
  }

  const notificationsSnapshot = await notificationsQuery.get();

  const notifications = [];
  notificationsSnapshot.forEach((doc) => {
    notifications.push(transformNotificationData(doc));
  });

  return notifications;
};

router.route("/").get(authorization, async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;

    const isAdmin = user.role === "ADMIN";
    let userId;

    if (isAdmin) {
      userId = req.query.userId || user.id;
    } else {
      userId = user.id;
    }
    const { keyword = "", skip = 0, limit = 10, ...filters } = req.query;

    let notificationsQuery = db.collection("Notifications");

    if (userId) {
      notificationsQuery = notificationsQuery.where("userId", "==", userId);
    }

    if (filters.createdAt) {
      if (filters.createdAt["gte"]) {
        notificationsQuery = notificationsQuery.where(
          "createdAt",
          ">=",
          new Date(filters.createdAt["gte"])
        );
      }
      if (filters.createdAt["lte"]) {
        notificationsQuery = notificationsQuery.where(
          "createdAt",
          "<=",
          new Date(filters.createdAt["lte"])
        );
      }
    }

    if (keyword) {
      const titleField = lang === "ar" ? "titleAr" : "title";
      notificationsQuery = notificationsQuery
        .where(titleField, ">=", keyword)
        .where(titleField, "<=", keyword + "\uf8ff")
        .orderBy(titleField);
    }

    if (!keyword)
      notificationsQuery = notificationsQuery.orderBy("createdAt", "desc");

    const notificationsUnreadQuery = db
      .collection("Notifications")
      .where("userId", "==", user.id)
      .where("read", "==", false);

    const countSnapshot = await notificationsQuery.count().get();
    const UnreadNotificationsSnapshot = await notificationsUnreadQuery
      .count()
      .get();
    const totalUnreadNotifications = UnreadNotificationsSnapshot.data().count;
    const totalUserNotifications = countSnapshot.data().count;

    const userNotifications = await getNotificationsData({
      userId,
      keyword,
      filters,
      lang,
      limit,
      skip,
    });

    const totalPages = Math.ceil(totalUserNotifications / limit);

    return res.status(200).json({
      message: getTranslation(lang, "success"),
      userNotifications,
      totalUserNotifications,
      totalPages,
      totalUnreadNotifications,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

router.route("/send-notification").post(authorization, async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;
    const { desc, title } = req.body;
    if (!desc || !title) {
      return res
        .status(400)
        .json({ message: getTranslation(lang, "missingFields") });
    }
    if (user.role !== "ADMIN") {
      return res
        .status(401)
        .json({ message: getTranslation(lang, "unauthorized") });
    }

    // get the total
    const totalUsers = await prisma.user.count({
      where: {
        fcmToken: {
          not: null,
        },
        role: {
          equals: "CUSTOMER",
        },
      },
    });

    const users = await prisma.user.findMany({
      where: {
        fcmToken: {
          not: null,
        },
        role: {
          equals: "CUSTOMER",
        },
      },
      select: {
        id: true,
        fcmToken: true,
        lang: true,
      },
    });

    await pushNotification({
      key: {
        title,
        desc,
      },
      lang,
      users,
      sendToAdmins: false,
    });

    return res.status(200).json({
      message: getTranslation(lang, "success"),
      sentTo: totalUsers,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
