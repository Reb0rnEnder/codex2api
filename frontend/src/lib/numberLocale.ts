import i18next from "i18next";

// Use the selected UI language rather than the server or OS locale.
export function numberDisplayLocale(): string {
  const language = (i18next.resolvedLanguage || i18next.language || "en").toLowerCase();
  if (language.startsWith("zh-tw") || language.startsWith("zh-hant")) return "zh-TW";
  return language.startsWith("zh") ? "zh-CN" : "en-US";
}
