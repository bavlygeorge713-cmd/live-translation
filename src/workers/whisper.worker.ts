import { pipeline, env } from "@xenova/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber: Awaited<ReturnType<typeof pipeline>> | null = null;
let loadedModel = "";

async function ensureModel(modelId: string) {
  if (transcriber && loadedModel === modelId) return transcriber;

  transcriber = null;
  loadedModel = "";

  self.postMessage({ type: "loading", modelId });

  transcriber = await pipeline(
    "automatic-speech-recognition",
    modelId,
    {
      progress_callback: (data: Record<string, unknown>) => {
        self.postMessage({ type: "progress", modelId, data });
      },
    }
  );

  loadedModel = modelId;
  self.postMessage({ type: "ready", modelId });
  return transcriber;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, id, audio, language, modelId } = e.data as {
    type: string;
    id: string;
    audio: Float32Array;
    language: string;
    modelId: string;
  };

  // Preload: just load the model without transcribing
  if (type === "preload") {
    try {
      await ensureModel(modelId ?? "Xenova/whisper-tiny");
    } catch (err) {
      self.postMessage({ type: "error", id: "preload", modelId, error: (err as Error).message });
    }
    return;
  }

  if (type !== "transcribe") return;

  try {
    const pipe = await ensureModel(modelId ?? "Xenova/whisper-tiny");

    const result = await (pipe as any)(audio, {
      language: language && language !== "auto" ? language : undefined,
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });

    self.postMessage({
      type: "result",
      id,
      text: (result as any).text?.trim() ?? "",
      detectedLanguage: (result as any).language ?? null,
    });
  } catch (err) {
    self.postMessage({ type: "error", id, error: (err as Error).message });
  }
};
