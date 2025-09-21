import express from "express";
import prisma from "../../../prisma/client.js";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import FeatureApi from "../../../utils/FetchDataApis.js";

const router = express.Router();

router.route("/").get(async (req, res) => {
  const lang = langReq(req);
  try {
    const data = new FeatureApi(req)
      .fields()
      .filter()
      .skip()
      .sort()
      .limit()
      .keyword(["name"], "OR").data;

    const totalCount = await prisma.country.count({ where: data.where });
    const totalPages = Math.ceil(totalCount / (parseInt(data.take) || 10));

    const countries = await prisma.country.findMany(data);

    return res.status(200).json({
      message: getTranslation(lang, "countries_fetched"),
      countries,
      totalCount,
      totalPages,
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
