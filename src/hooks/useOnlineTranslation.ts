import { useCallback } from "react";
import { useStore } from "@/store/translationStore";

// ── Google Translate (unofficial, no key, excellent quality) ──────────────────
async function googleTranslate(text: string, from: string, to: string): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google Translate error: ${res.status}`);
  const data = await res.json();
  const translated: string = (data[0] as any[][])
    ?.map((chunk) => chunk[0] ?? "")
    .join("") ?? "";
  if (!translated.trim()) throw new Error("Empty translation response");
  return translated.trim();
}

// ── DeepL (free tier: 500k chars/month — get key at deepl.com) ───────────────
// Source lang codes: 2-letter uppercase. Target lang codes: can be specific (EN-US etc.)
const DEEPL_SRC: Record<string, string> = {
  en: "EN", ar: "AR", es: "ES", fr: "FR", de: "DE", it: "IT",
  pt: "PT", ru: "RU", ja: "JA", zh: "ZH", ko: "KO", nl: "NL",
  pl: "PL", tr: "TR", uk: "UK", id: "ID",
};
const DEEPL_TGT: Record<string, string> = {
  en: "EN-US", ar: "AR", es: "ES", fr: "FR", de: "DE", it: "IT",
  pt: "PT-BR", ru: "RU", ja: "JA", zh: "ZH-HANS", ko: "KO", nl: "NL",
  pl: "PL", tr: "TR", uk: "UK", id: "ID",
};

async function deeplTranslate(text: string, from: string, to: string, apiKey: string): Promise<string> {
  const srcCode = DEEPL_SRC[from];
  const tgtCode = DEEPL_TGT[to];
  if (!tgtCode) throw new Error(`DeepL: unsupported target language "${to}"`);

  const body: Record<string, unknown> = {
    text: [text],
    target_lang: tgtCode,
  };
  if (srcCode) body.source_lang = srcCode;

  const res = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DeepL error: ${res.status}`);
  const data = await res.json();
  const translated: string = data?.translations?.[0]?.text ?? "";
  if (!translated.trim()) throw new Error("Empty DeepL response");
  return translated.trim();
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useOnlineTranslation() {
  const { translationProvider, deeplApiKey } = useStore();

  const translate = useCallback(
    async (text: string, srcLang: string, tgtLang: string): Promise<string> => {
      const t = text.trim();
      if (!t) return text;
      const from = !srcLang || srcLang === "auto" ? "en" : srcLang;
      if (from === tgtLang) return text;

      if (translationProvider === "deepl" && deeplApiKey.trim()) {
        try {
          return await deeplTranslate(t, from, tgtLang, deeplApiKey.trim());
        } catch {
          // Silently fall back to Google Translate if DeepL fails
          return googleTranslate(t, from, tgtLang);
        }
      }

      return googleTranslate(t, from, tgtLang);
    },
    [translationProvider, deeplApiKey]
  );

  return { translate };
}
