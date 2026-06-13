import { useCallback } from "react";
import { useStore } from "@/store/translationStore";

// ── Google Translate (Safety Net) ──────────────────────────────────────────
async function googleTranslate(
  text: string,
  to: string,
  signal?: AbortSignal,
): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Google error: ${res.status}`);
  const data = await res.json();
  const translated: string =
    (data[0] as any[][])?.map((c) => c[0] ?? "").join("") ?? "";
  if (!translated.trim()) throw new Error("Empty Google response");
  return translated.trim();
}

// ── DeepL (Secondary) ──────────────────────────────────────────────────────
const DEEPL_TGT: Record<string, string> = {
  en: "EN-US",
  ar: "AR",
  es: "ES",
  fr: "FR",
  de: "DE",
  it: "IT",
  pt: "PT-BR",
  ru: "RU",
  ja: "JA",
  zh: "ZH-HANS",
  ko: "KO",
};

async function deeplTranslate(
  text: string,
  to: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const tgtCode = DEEPL_TGT[to] || to.toUpperCase();
  const res = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    // Omit source_lang → DeepL auto-detects
    body: JSON.stringify({ text: [text], target_lang: tgtCode }),
    signal,
  });
  if (!res.ok) throw new Error(`DeepL error: ${res.status}`);
  const data = await res.json();
  const result = data?.translations?.[0]?.text?.trim() || "";
  if (!result) throw new Error("Empty DeepL response");
  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  name: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const translationCache = new Map<string, { result: string; ts: number }>();
const groqCooldownUntil = { current: 0 };

const deeplCooldownUntil = { current: 0 };

async function groqTranslateViaServer(
  text: string,
  to: string,
  roomId?: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, to, roomId: roomId ?? "" }),
    signal,
  });
  if (res.status === 429) {
    groqCooldownUntil.current = Date.now() + 60_000;
    throw new Error("Groq 429");
  }
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  const result = (data.translation as string | undefined)?.trim() ?? "";
  if (!result) throw new Error("Empty Groq response");
  return result;
}

export function useOnlineTranslation(roomId?: string) {
  const { translationEngine, setLastUsedProvider } = useStore();

  const translate = useCallback(
    async (
      text: string,
      _srcLang: string,
      tgtLang: string,
      signal?: AbortSignal,
    ): Promise<string> => {
      const t = text.trim();
      if (!t) return text;

      const cacheKey = `${translationEngine}_${tgtLang}_${t}`;
      const cached = translationCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < 60_000) return cached.result;

      const deeplKey = (import.meta.env.VITE_DEEPL_API_KEY ?? "").trim();

      const doGroq = async () => {
        if (Date.now() < groqCooldownUntil.current)
          throw new Error("Groq unavailable");
        const res = await withTimeout(
          groqTranslateViaServer(t, tgtLang, roomId, signal),
          3000,
          "Groq",
        );
        setLastUsedProvider("Groq");
        return res;
      };

      const doDeepL = async () => {
        if (!deeplKey || Date.now() < deeplCooldownUntil.current)
          throw new Error("DeepL unavailable");
        try {
          const res = await withTimeout(
            deeplTranslate(t, tgtLang, deeplKey, signal),
            400,
            "DeepL",
          );
          setLastUsedProvider("DeepL");
          return res;
        } catch (e: unknown) {
          const msg = (e as Error).message ?? "";
          if (msg.includes("429"))
            deeplCooldownUntil.current = Date.now() + 60_000;
          throw e;
        }
      };

      const doGoogle = async (isFallback = false) => {
        const res = await googleTranslate(t, tgtLang, signal);
        setLastUsedProvider(
          `Google Translate${isFallback ? " (Fallback)" : ""}`,
        );
        return res;
      };

      let result = "";
      try {
        if (translationEngine === "groq") result = await doGroq();
        else if (translationEngine === "deepl") result = await doDeepL();
        else if (translationEngine === "google") result = await doGoogle();
        else {
          // Auto: race Groq vs Google — first response wins (eliminates Groq timeout penalty)
          try {
            result = await Promise.any([doGroq(), doGoogle()]);
          } catch {
            result = await doGoogle(true);
          }
        }
      } catch {
        result = await doGoogle(true);
      }

      if (result) translationCache.set(cacheKey, { result, ts: Date.now() });
      return result;
    },
    [translationEngine, setLastUsedProvider],
  );

  return { translate };
}
