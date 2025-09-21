import express from "express";
import authorization from "../../middleware/authorization.js";
import getTranslation, { langReq } from "../../middleware/getTranslation.js";

const router = express.Router();

router.get("/", authorization, async (req, res) => {
  const lang = langReq(req);
  try {
    const user = req.user;
    delete user.fcmToken;
    res.status(200).json({ user });
  } catch (error) {
    console.error(error);
    res
      .status(400)
      .json({
        message: getTranslation(lang, "internalError"),
        error: error.message,
      });
  }
});

export default router;
