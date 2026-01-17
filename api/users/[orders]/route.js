import express from "express";
import authorization from "../../../middleware/authorization.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import prisma from "../../../prisma/client.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();

router.route("/:id/orders").get(authorization(), async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;
    const { id } = req.params;
    const isAdmin = user.role === "admin";

    if (!isAdmin && user.id !== id)
      return res.status(403).json({
        message: getTranslation(lang, "forbidden"),
      });

    const data = new FeatureApi(req)
      .filter({ customerId: id })
      .fields()
      .sort()
      .skip()
      .limit(10)
      .keyword(["orderNumber"], "OR").data;

    const [orders, totalCount, orderSums] = await Promise.all([
      prisma.order.findMany(data),
      prisma.order.count({ where: data.where }),
      prisma.order.groupBy({
        by: ["status"],
        _sum: {
          totalAmount: true,
        },
        where: data.where,
      }),
    ]);
    const totalPages = Math.ceil(totalCount / +data.take);

    return res.status(200).json({
      orders,
      totalPages,
      totalCount,
      orderSums: orderSums.reduce((acc, curr) => {
        acc[curr.status] = curr._sum.totalAmount || 0;
        return acc;
      }, {}),
      message: getTranslation(lang, "success"),
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
