import messages from "../lang/messages.js";

/**
 * Get translation for a given key and language
 * @param {string} lang - Language code (e.g., 'en', 'ar')
 * @param {string} key - Translation key (e.g., 'welcome')
 * @param {Array} [args] - Arguments to pass if the key maps to a function
 * @returns {string} - Translated string or a fallback message
 */
const getTranslation = (lang, key, args = []) => {
  try {
    const translations = messages;
    const value = translations[lang]?.[key];

    // Check if the value is a function and call it with arguments
    if (typeof value === "function" && args?.length) {
      return value(...args);
    }

    // Return the value if it's a string or the fallback key
    return value || `${key}`;
  } catch (error) {
    console.error("Error loading translations:", error.message);
    return "Error loading translations";
  }
};

export default getTranslation;

/**
 * Get the language from the request
 * @param {import("express").Request} req - Express request object
 * @returns {"en" | "ar"} - Language code en | ar
 */
export const langReq = (req) => {
  const lang = req.query.lang || req.headers["accept-language"] || "ar";
  return lang;
};
