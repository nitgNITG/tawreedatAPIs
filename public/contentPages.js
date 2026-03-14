import express from "express";
import sanitizeHtml from "sanitize-html";

const router = express.Router();

const ABOUT_APP_API =
  "https://tawreedat.nitg-eg.com/admin_apis/api/v1/about-app";

const PAGE_CONFIG = {
  terms: {
    title: {
      en: "Terms & Conditions",
      ar: "الشروط والأحكام",
    },
    field: {
      en: "terms",
      ar: "terms_ar",
    },
  },
  delete_account: {
    title: {
      en: "Delete Account",
      ar: "حذف الحساب",
    },
    field: {
      en: "delete_account",
      ar: "delete_account_ar",
    },
  },
};

function getLang(req) {
  const lang = String(req.params.lang || req.query.lang || "en").toLowerCase();
  return lang === "ar" ? "ar" : "en";
}

function sanitizeContent(html) {
  return sanitizeHtml(html || "", {
    allowedTags: ["h1", "h2", "p", "strong", "br", "ul", "ol", "li", "a"],
    allowedAttributes: {
      a: ["href", "target", "rel"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

function renderHtmlPage({ title, lang, contentHtml }) {
  const isArabic = lang === "ar";
  const dir = isArabic ? "rtl" : "ltr";

  return `
    <!DOCTYPE html>
    <html lang="${lang}" dir="${dir}">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${title}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #f5f5f5;
            margin: 0;
            padding: 30px;
            line-height: 1.8;
            color: #222;
          }
          .container {
            max-width: 900px;
            margin: auto;
            background: #fff;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
          }
          h1 {
            margin-top: 0;
          }
          h2 {
            margin-top: 24px;
          }
          p {
            margin: 12px 0;
          }
          a {
            color: #0b57d0;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div>${contentHtml || title}</div>
        </div>
      </body>
    </html>
  `;
}

async function fetchAboutApp() {
  const response = await fetch(ABOUT_APP_API, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch about-app: ${response.status}`);
  }

  const result = await response.json();
  return result?.about_app || result;
}

async function renderContentPage(req, res, next) {
  try {
    const pageKey = req.params.page;
    const pageConfig = PAGE_CONFIG[pageKey];

    if (!pageConfig) {
      return res.status(404).send("Page not found");
    }

    const lang = getLang(req);
    const fallbackLang = lang === "ar" ? "en" : "ar";

    const aboutApp = await fetchAboutApp();

    const rawHtml =
      aboutApp?.[pageConfig.field[lang]] ||
      aboutApp?.[pageConfig.field[fallbackLang]] ||
      "";

    const contentHtml = sanitizeContent(rawHtml);
    const title = pageConfig.title[lang];

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    res.send(
      renderHtmlPage({
        title,
        lang,
        contentHtml,
      }),
    );
  } catch (err) {
    next(err);
  }
}

router.get(
  "/terms",
  (req, res, next) => {
    req.params.page = "terms";
    next();
  },
  renderContentPage,
);

router.get(
  "/terms/:lang",
  (req, res, next) => {
    req.params.page = "terms";
    next();
  },
  renderContentPage,
);

router.get(
  "/delete_account",
  (req, res, next) => {
    req.params.page = "delete_account";
    next();
  },
  renderContentPage,
);

router.get(
  "/delete_account/:lang",
  (req, res, next) => {
    req.params.page = "delete_account";
    next();
  },
  renderContentPage,
);

export default router;
