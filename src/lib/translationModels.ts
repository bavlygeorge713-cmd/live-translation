// opus-mt model names for Xenova/transformers
// Each model is ~75-150 MB, downloaded once and cached by the browser.

// Models that translate INTO English
export const TO_EN: Record<string, string> = {
  es: "Xenova/opus-mt-es-en",
  fr: "Xenova/opus-mt-fr-en",
  de: "Xenova/opus-mt-de-en",
  it: "Xenova/opus-mt-it-en",
  pt: "Xenova/opus-mt-pt-en",
  ru: "Xenova/opus-mt-ru-en",
  zh: "Xenova/opus-mt-zh-en",
  ar: "Xenova/opus-mt-ar-en",
  nl: "Xenova/opus-mt-nl-en",
  pl: "Xenova/opus-mt-pl-en",
  sv: "Xenova/opus-mt-sv-en",
  tr: "Xenova/opus-mt-tr-en",
  uk: "Xenova/opus-mt-uk-en",
  // Fallback: multilingual → English (covers most languages)
  _default: "Xenova/opus-mt-mul-en",
};

// Models that translate FROM English
export const FROM_EN: Record<string, string> = {
  es: "Xenova/opus-mt-en-es",
  fr: "Xenova/opus-mt-en-fr",
  de: "Xenova/opus-mt-en-de",
  it: "Xenova/opus-mt-en-it",
  pt: "Xenova/opus-mt-en-pt",
  ru: "Xenova/opus-mt-en-ru",
  zh: "Xenova/opus-mt-en-zh",
  ar: "Xenova/opus-mt-en-ar",
  nl: "Xenova/opus-mt-en-nl",
  pl: "Xenova/opus-mt-en-pl",
  sv: "Xenova/opus-mt-en-sv",
  tr: "Xenova/opus-mt-en-tr",
  uk: "Xenova/opus-mt-en-uk",
};

export function getToEnModel(lang: string): string {
  return TO_EN[lang] ?? TO_EN._default;
}

export function getFromEnModel(lang: string): string | null {
  return FROM_EN[lang] ?? null;
}

export function isSupportedTarget(lang: string): boolean {
  return lang === "en" || lang in FROM_EN;
}
