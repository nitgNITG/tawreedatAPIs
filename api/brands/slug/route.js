import { Router } from "express";
import getTranslation, { langReq } from "../../../middleware/getTranslation.js";
import FeatureApi from "../../../utils/FetchDataApis.js";
import prisma from "../../../prisma/client.js";

const router = Router();

router.route("/:slug").get(async (req, res) => {
  const lang = langReq(req);
  const slug = req.params.slug;

  try {
    const data = new FeatureApi(req).fields().filter({ slug }).data;
    const brand = await prisma.brand.findUnique(data);

    if (!brand) {
      return res.status(404).json({
        message: getTranslation(lang, "brand_not_found"),
      });
    }

    res.status(200).json(brand);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      message: getTranslation(lang, "internalError"),
      error: error.message,
    });
  }
});

export default router;
