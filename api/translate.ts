const cleanEnv = (v: string | undefined) => v?.replace(/^﻿/, "").trim() ?? "";

function getGroqKeys(): string[] {
  const base = cleanEnv(process.env.GROQ_API_KEY);
  const key1 = cleanEnv(process.env.GROQ_API_KEY_1) || base;
  const key2 = cleanEnv(process.env.GROQ_API_KEY_2) || base;
  return [key1, key2].filter(Boolean);
}

function hashRoom(roomId: string): 0 | 1 {
  let h = 0;
  for (let i = 0; i < roomId.length; i++) {
    h = (h * 31 + roomId.charCodeAt(i)) >>> 0;
  }
  return (h % 2) as 0 | 1;
}

const LANG_NAMES: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  tr: "Turkish",
};

async function callGroq(
  text: string,
  to: string,
  srcHint: string,
  apiKey: string,
): Promise<string> {
  const tgtName = LANG_NAMES[to] || to;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            `You are a silent translation engine for a medical conference. ` +
            `Output ONLY the translated text in ${tgtName}. ` +
            `Never ask questions, never comment, never add words. ` +
            `Preserve medical terminology precisely. ` +
            (srcHint ? srcHint : ""),
        },
        { role: "user", content: text },
      ],
      temperature: 0,
      max_tokens: 150,
    }),
  });
  if (res.status === 429) {
    const err = new Error("Groq 429") as Error & { status: number };
    err.status = 429;
    throw err;
  }
  if (!res.ok) throw new Error(`Groq error: ${res.status}`);
  const data = await res.json();
  const result = (data.choices?.[0]?.message?.content?.trim() ?? "") as string;
  if (!result) throw new Error("Empty Groq response");
  return result;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  try {
    const {
      text,
      to,
      srcHint = "",
      roomId = "",
      keyPref,
    } = req.body as {
      text: string;
      to: string;
      srcHint?: string;
      roomId?: string;
      // When set (0 or 1): use only that specific key — no internal fallback.
      // The client handles the fallback chain tier-by-tier.
      keyPref?: 0 | 1;
    };
    if (!text?.trim()) {
      res.status(400).json({ error: "Missing text" });
      return;
    }
    if (!to?.trim()) {
      res.status(400).json({ error: "Missing target language" });
      return;
    }

    const keys = getGroqKeys();
    if (keys.length === 0) {
      res.status(503).json({ error: "Groq not configured" });
      return;
    }

    let translation: string;

    if (keyPref === 0 || keyPref === 1) {
      // Explicit key requested — use it only, no fallback (client manages the chain)
      const key = keys[keyPref] ?? keys[0];
      translation = await callGroq(text.trim(), to, srcHint, key);
    } else {
      // Legacy path (TextVoiceOver, etc.): primary then fallback within one request
      const primary =
        keys.length > 1
          ? hashRoom(roomId) === 0
            ? keys[0]
            : keys[1]
          : keys[0];
      const fallback =
        keys.length > 1 ? (primary === keys[0] ? keys[1] : keys[0]) : null;
      try {
        translation = await callGroq(text.trim(), to, srcHint, primary);
      } catch (e: any) {
        if (e.status === 429 && fallback) {
          translation = await callGroq(text.trim(), to, srcHint, fallback);
        } else {
          throw e;
        }
      }
    }

    res.status(200).json({ translation });
  } catch (err: any) {
    console.error("translate error:", err?.message ?? err);
    const status = (err as any)?.status === 429 ? 429 : 500;
    res.status(status).json({ error: err?.message ?? "Server error" });
  }
}
