import { isExpired } from "../../api/auth/confirm-user/route.js";
import getTranslation from "../../middleware/getTranslation.js";
import prisma from "../../prisma/client.js";
import { getUserClass } from "../../utils/extractUserClass.js";
import pushNotification from "../../utils/push-notification.js";

export const payment = async (req, res) => {
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
                logo: true,
                cover: true,
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
        pointBackValidity: true,
      },
    })) || {
      srRatio: 10,
      pointBackRatio: 10,
      pointBackValidity: 15,
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

    let type = await prisma.userType.findFirst({
      where: {
        buyAmount: {
          gte: userWallet.buyerAmount,
        },
      },
      orderBy: {
        buyAmount: "asc",
      },
    });
    if (type == null) {
      type = await prisma.userType.findFirst({
        where: {
          buyAmount: {
            lte: userWallet.buyerAmount,
          },
        },
        orderBy: {
          buyAmount: "desc",
        },
      });
    }

    const mostasmerRatioFromBrand = session.brandToken.brand.ratio;
    const pointBackRatio = session.brandToken.brand.pointBackRatio;
    const userTypeRatio = type.ratio;
    const amount = session.amount;

    const totalAppPrice = (amount * mostasmerRatioFromBrand) / 100;

    // the ratio that should user take from brand
    const userPriceFromBrand = (totalAppPrice * pointBackRatio) / 100;

    // but take point back from his type.
    let userPrice = (userPriceFromBrand * userTypeRatio) / 100;
    console.log("13 userPrice: " + userPrice);

    //valdiation brand this mean this point will vaild to date.
    const validToBrandPoints = new Date();
    validToBrandPoints.setMonth(
      validToBrandPoints.getMonth() + session.brandToken.brand.validityPeriod
    );

    // calculate the brand amount.
    let brandAmount = amount - totalAppPrice;

    let allPointsBack = [];
    let userPointBackRatio = ((userPrice / amount) * 1000) / 10;

    allPointsBack.push({
      userPointBackRatio,
      ratio: userPrice,
      type: "User Type offer",
    });

    // define the data of the wallet history to make some editing when happen action
    const walletHistoryData = {
      walletId: userWallet.id,
      paymentamount: amount,
      validTo: validToBrandPoints,
      validFrom: new Date(
        new Date().setDate(new Date().getDate() + setting.pointBackValidity)
      ),
      brandAmount: brandAmount,
      brandId: session.brandToken.brand.id,
      mostasmer: amount - (brandAmount + userPrice),
      user: userPrice,
    };

    // If there is special offer data
    const specialOffer = await prisma.specialOffer.findFirst({
      where: {
        brandId: session.brandToken.brand.id,
        badgeId: type.badgeId,
        validTo: { gt: new Date() },
        validFrom: { lt: new Date() },
      },
    });

    const offers = [];

    offers.push({
      validTo: validToBrandPoints,
      ratio: userPointBackRatio,
      type: "User Type offer",
      offerId: `USR${type.id}`,
    });

    if (specialOffer) {
      // update the user amount
      const amountOfOffer = (amount * specialOffer.ratio) / 100;
      userPointBackRatio += specialOffer.ratio;

      // increase the user price
      userPrice = userPrice + amountOfOffer;

      allPointsBack.push({
        userPointBackRatio: specialOffer.ratio,
        ratio: amountOfOffer,
        type: "special offer",
      });

      //decrement the brand price
      brandAmount = brandAmount - amountOfOffer;

      offers.push({
        ratio: specialOffer.ratio,
        validTo: specialOffer.validTo,
        type: "special offer",
        offerId: `SPE${specialOffer.id}`,
      });
    }
    const exclusiveOffer = await prisma.exclusiveOffer.findFirst({
      where: {
        brandId: session.brandToken.brand.id,
        validTo: { gt: new Date() },
        validFrom: { lt: new Date() },
      },
    });

    if (exclusiveOffer) {
      // update the user amount
      const amountOfOffer = (amount * exclusiveOffer.ratio) / 100;
      userPointBackRatio += exclusiveOffer.ratio;

      // increase the user price
      userPrice = userPrice + amountOfOffer;

      allPointsBack.push({
        userPointBackRatio: exclusiveOffer.ratio,
        ratio: amountOfOffer,
        type: "exclusive offer",
      });

      //decrement the brand price
      brandAmount = brandAmount - amountOfOffer;

      offers.push({
        ratio: exclusiveOffer.ratio,
        validTo: exclusiveOffer.validTo,
        type: "exclusive offer",
        offerId: `EXC${exclusiveOffer.id}`,
      });
    }

    const digitalSeals = await prisma.digitalSeals.findFirst({
      where: {
        brandId: session.brandToken.brand.id,
        validTo: { gt: new Date() },
        validFrom: { lt: new Date() },
      },
    });

    const userOrderCount = await prisma.userBrandOrderCount.findUnique({
      where: {
        userId_brandId: {
          userId: user.id,
          brandId: session.brandToken.brand.id,
        },
      },
      select: {
        count: true,
      },
    });

    if (digitalSeals && userOrderCount && digitalSeals.purchaseCount > 0) {
      const isOfferApplicable =
        (userOrderCount.count + 1) % digitalSeals.purchaseCount === 1;

      if (isOfferApplicable) {
        const amountOfOffer = (amount * digitalSeals.ratio) / 100;
        userPointBackRatio += digitalSeals.ratio;
        allPointsBack.push({
          userPointBackRatio: digitalSeals.ratio,
          ratio: amountOfOffer,
          type: "digital seals offer",
        });

        userPrice += amountOfOffer;
        brandAmount -= amountOfOffer;

        offers.push({
          ratio: digitalSeals.ratio,
          validTo: digitalSeals.validTo,
          type: "digital seals offer",
          offerId: `DIG${digitalSeals.id}`,
        });
      }
    }

    const userClass = await getUserClass(user.id, session.brandToken.brand.id);

    const customOffer = await prisma.customOffer.findFirst({
      where: {
        brandId: session.brandToken.brand.id,
        validTo: { gt: new Date() },
        validFrom: { lt: new Date() },
        userClassId: userClass.id,
      },
    });

    if (customOffer) {
      // update the user amount
      const amountOfOffer = (amount * customOffer.ratio) / 100;
      userPointBackRatio += customOffer.ratio;
      // increase the user price
      userPrice = userPrice + amountOfOffer;
      allPointsBack.push({
        userPointBackRatio: customOffer.ratio,
        ratio: amountOfOffer,
        type: "custom offer",
      });
      //decrement the brand price
      brandAmount = brandAmount - amountOfOffer;
      offers.push({
        ratio: customOffer.ratio,
        validTo: customOffer.validTo,
        type: "custom offer",
        offerId: `CUS${customOffer.id}`,
      });
    }

    if (allPointsBack.length > 1) {
      allPointsBack.push({
        userPointBackRatio,
        ratio: userPrice,
        type: "Total Offers Back",
      });
    }

    if (offers?.length) {
      walletHistoryData.OfferDetialsWalletHistory = {
        createMany: {
          data: offers,
        },
      };
    }

    //convert the user price to point from mostasmer settings.
    const points = Math.trunc(userPrice * setting.srRatio);

    //update the point in the history of wallet.
    walletHistoryData.point = points;
    walletHistoryData.remainingPoint = points;
    walletHistoryData.brandAmount = brandAmount;
    walletHistoryData.user = userPrice;

    // make the transaction in the payment
    const [walletHistory, w, b, bw] = await prisma.$transaction([
      //create the wallet history.
      prisma.walletHistory.create({
        data: walletHistoryData,
      }),
      //update the user wallet.
      prisma.wallet.update({
        where: {
          userId: user.id,
        },
        data: {
          point: { increment: points },
          buyerAmount: { increment: amount },
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
          money: 0,
        },
        update: {
          money: { increment: brandAmount },
        },
      }),
      prisma.allWalletPoints.upsert({
        where: { id: 1 },
        create: {
          points: points,
          allBuyerAmount: amount,
        },
        update: {
          points: { increment: points },
          allBuyerAmount: { increment: amount },
        },
      }),
      prisma.order.create({
        data: {
          userId: user.id,
          brandId: session.brandToken.brand.id,
          totalPrice: amount,
        },
      }),
      prisma.userBrandOrderCount.upsert({
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
      }),
    ]);

    // check if there is first point will expired.
    const findFirstExpiredWalletHistory = await prisma.walletHistory.findFirst({
      orderBy: {
        validTo: "asc",
      },
    });

    let checkAt;
    if (findFirstExpiredWalletHistory?.validTo < walletHistory?.validTo) {
      checkAt = new Date(findFirstExpiredWalletHistory?.validTo);
    } else {
      checkAt = new Date(walletHistory?.validTo);
    }

    // update the wallet checkat and the point and buyerAmount
    const wallet = await prisma.wallet.update({
      where: {
        userId: user.id,
      },
      data: {
        checkAt: checkAt,
      },
    });

    res.status(200).json({
      message: getTranslation(lang, "successfully"),
      wallet,
      bw,
      offers: allPointsBack,
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
        title: "notification_payment_success_title_user",
        desc: "notification_payment_success_desc_user",
      },
      args: {
        title: [session.brandToken.brand.name],
        desc: [
          amount,
          points,
          session.brandToken.brand.name,
          walletHistory.validFrom.toISOString().split("T")[0],
        ],
      },
      lang,
      users: [
        {
          id: user.id,
          fcmToken: user.fcmToken,
          lang: user.lang,
        },
      ],
      data: {
        navigate: "wallet",
        route: `/${lang}/users/${user.id}#orders`,
      },
      sendToAdmins: false,
    });

    await pushNotification({
      key: {
        title: "notification_payment_success_title",
        desc: "notification_payment_success_desc",
      },
      args: {
        title: [user.fullname, amount, session.brandToken.brand.name],
        desc: [user.fullname, amount, points, session.brandToken.brand.name, walletHistory.validFrom.toISOString().split("T")[0]],
      },
      lang,
      users: users.BrandRepresentative.map((rep) => ({
        id: rep.User.id,
        fcmToken: rep.User.fcmToken,
        lang: rep.User.lang,
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
