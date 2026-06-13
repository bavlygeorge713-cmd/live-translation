// Groq Whisper transcription proxy. Edge runtime so req.formData() parses
// multipart natively and audio blobs (~30-60KB opus per 3.5s window, well
// under the ~4MB edge body limit) pass straight through to Groq.
export const config = { runtime: "edge" };

const cleanEnv = (v: string | undefined) => v?.replace(/^﻿/, "").trim() ?? "";

function getGroqKeys(): string[] {
  const base = cleanEnv(process.env.GROQ_API_KEY);
  const key1 = cleanEnv(process.env.GROQ_API_KEY_1) || base;
  const key2 = cleanEnv(process.env.GROQ_API_KEY_2) || base;
  return [...new Set([key1, key2].filter(Boolean))];
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const keys = getGroqKeys();
  if (keys.length === 0)
    return json(503, { error: "No Groq API keys configured" });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, {
      error: "Expected multipart/form-data with an audio file",
    });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return json(400, { error: "Missing audio file" });
  }

  const language = String(form.get("language") ?? "")
    .trim()
    .toLowerCase();

  let lastError = "Transcription failed";
  let lastGroqStatus = 0;
  let lastGroqBody = "";

  for (const key of keys) {
    const groqForm = new FormData();
    groqForm.append("file", audio, audio.name || "audio.webm");
    groqForm.append("model", "whisper-large-v3-turbo");
    groqForm.append("temperature", "0");
    groqForm.append("response_format", "json");
    if (/^[a-z]{2,3}$/.test(language)) groqForm.append("language", language);

    try {
      const res = await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${key}` },
          body: groqForm,
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        return json(200, { text: (data.text ?? "").trim() });
      }
      lastGroqStatus = res.status;
      lastGroqBody = (await res.text().catch(() => "")).slice(0, 500);
      lastError = `Groq HTTP ${res.status}`;
      // 429/5xx → try the next key; other 4xx are request errors, don't retry
      if (res.status !== 429 && res.status < 500) break;
    } catch (err) {
      lastGroqStatus = 0;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // Surface the real failure: pass 4xx (429 included) through so the client
  // can react specifically; network/5xx collapse to 502
  const status =
    lastGroqStatus === 429
      ? 429
      : lastGroqStatus >= 400 && lastGroqStatus < 500
        ? lastGroqStatus
        : 502;
  console.error(
    "transcribe failed:",
    status,
    "groq:",
    lastGroqStatus,
    lastGroqBody.slice(0, 200),
  );
  return json(status, {
    error: lastError,
    status,
    groqStatus: lastGroqStatus,
    groqBody: lastGroqBody,
  });
}
