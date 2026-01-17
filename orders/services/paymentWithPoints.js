import getTranslation from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import {
  calculateWalletPoints,
  deductWalletPoints,
} from "../../utils/calculateWallet.js";
import isExpired from "../../utils/isExpired.js";
import pushNotification from "../../utils/push-notification.js";

export const paymentWithPoints = async (req, res) => {
  const lang = req.query.lang || "ar";
  const sessionId = +req.params.sessionId;
  try {
    const user = req.user;
    const session = await prisma.brandOrderSession.findUnique({
      where: {
        id: sessionId,
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        expired: true,
        brandToken: {
          select: {
            expired: true,
            brand: {
              select: {
                id: true,
                name: true,
                email: true,
                validTo: true,
                ratio: true,
                pointBackRatio: true,
                validityPeriod: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }
    if (isExpired(session.createdAt, 30)) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }
    if (session.expired) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }
    if (session.brandToken.expired) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }
    if (session.brandToken.brand.validTo < new Date()) {
      return res
        .status(403)
        .json({ message: getTranslation(lang, "session_expired") });
    }
    await prisma.brandOrderSession.update({
      where: {
        id: session.id,
      },
      data: {
        expired: true,
      },
    });
    const setting = (await prisma.applicationSettings.findFirst({
      select: {
        srRatio: true,
        pointBackRatio: true,
      },
    })) || {
      srRatio: 10,
      pointBackRatio: 10,
    };

    let userWallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });
    if (!userWallet) {
      userWallet = await prisma.wallet.create({
        data: {
          point: 0,
          userId: user.id,
        },
      });
    }
    const { totalAvailable, walletHistories } = await calculateWalletPoints(
      userWallet.id
    );

    // Payment
    const amount = session.amount;
    const mostasmerRatioFromBrand = session.brandToken.brand.ratio;
    const totalAppPrice = (amount * mostasmerRatioFromBrand) / 100;
    let brandAmount = amount - totalAppPrice;

    // convert the amount to points
    const amountToPoints = amount * setting.srRatio;

    // check if the amount not enough;
    if (amountToPoints > totalAvailable) {
      return res
        .status(400)
        .json({ message: getTranslation(lang, "insufficient_balance") });
    }

    // make the transaction in the payment
    await prisma.$transaction([
      //create the wallet history.
      prisma.walletHistory.create({
        data: {
          walletId: userWallet.id,
          point: amountToPoints,
          paymentamount: amount,
          type: "PAYMENT",
          brandId: session.brandToken.brand.id,
          brandAmount,
          mostasmer: totalAppPrice,
        },
      }),
      //update the user wallet.
      prisma.wallet.update({
        where: {
          userId: user.id,
        },
        data: {
          point: { decrement: amountToPoints },
        },
      }),
      // update the brand purchase count.
      prisma.brand.update({
        where: { id: session.brandToken.brand.id },
        data: {
          purchaseCount: { increment: 1 },
        },
      }),
      //update the brand wallet.
      prisma.brandWallet.upsert({
        where: {
          brandId: session.brandToken.brand.id,
        },
        create: {
          brandId: session.brandToken.brand.id,
          money: brandAmount,
        },
        update: {
          money: { increment: brandAmount },
        },
      }),
      // update the points for mostasmer
      prisma.allWalletPoints.upsert({
        where: { id: 1 },
        create: {
          points: 0,
          allBuyerAmount: 0,
        },
        update: {
          points: { decrement: amountToPoints },
          allBuyerAmount: { decrement: brandAmount },
        },
      }),
    ]);

    res.status(200).json({ message: getTranslation(lang, "successfully") });

    await deductWalletPoints(walletHistories, amountToPoints);

    await prisma.order.create({
      data: {
        userId: user.id,
        brandId: session.brandToken.brand.id,
        totalPrice: amount,
      },
    });
    await prisma.userBrandOrderCount.upsert({
      where: {
        userId_brandId: {
          userId: user.id,
          brandId: session.brandToken.brand.id,
        },
      },
      create: {
        userId: user.id,
        brandId: session.brandToken.brand.id,
        count: 1,
        firstOrder: new Date(),
        lastOrder: new Date(),
      },
      update: {
        count: { increment: 1 },
        lastOrder: new Date(),
      },
    });

    // push notification for representive brand
    const users = await prisma.brand.findUnique({
      where: {
        id: session.brandToken.brand.id,
      },
      select: {
        BrandRepresentative: {
          select: {
            User: {
              select: {
                id: true,
                fcmToken: true,
                lang: true,
              },
            },
          },
        },
      },
    });
    await pushNotification({
      key: {
        title: "notification_payment_success_title_points_user",
        desc: "notification_payment_success_desc_points_user",
      },
      args: {
        title: [session.brandToken.brand.name],
        desc: [amountToPoints, session.brandToken.brand.name],
      },
      lang,
      users: [
        {
          id: user.id,
          fcmToken: user.fcmToken,
          lang: user.lang,
        },
      ],
      sendToAdmins: false,
      data: {
        navigate: "wallet",
        route: `/${lang}/users/${user.id}#orders`,
      },
    });
    await pushNotification({
      key: {
        title: "notification_payment_success_title_points",
        desc: "notification_payment_success_desc_points",
      },
      args: {
        title: [user.full_name, amountToPoints, session.brandToken.brand.name],
        desc: [user.full_name, amountToPoints, session.brandToken.brand.name],
      },
      lang: lang,
      users: users.BrandRepresentative.map(({ User }) => ({
        id: User.id,
        fcmToken: User.fcmToken,
        lang: User.lang,
      })),
      data: {
        navigate: "home",
        route: `/${lang}/users/${user.id}#orders`,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
};
