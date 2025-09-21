const extractLanguageContent = (text, lang) => {
  if (!text) return "";

  const regex = new RegExp(`{mlang ${lang}}(.*?){mlang}`, "i");
  const match = text.match(regex);

  if (match?.[1]) {
    return match[1].trim();
  }

  // Fallback to English if requested language not found
  if (lang !== "en") {
    const enMatch = text.match(/{mlang en}(.*?){mlang}/i);
    if (enMatch?.[1]) {
      return enMatch[1].trim();
    }
  }

  // If no language tags found, return original text
  return text.includes("{mlang") ? "" : text.trim();
};

export default extractLanguageContent;
