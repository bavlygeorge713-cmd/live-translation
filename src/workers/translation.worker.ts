import { pipeline, env } from "@xenova/transformers";

// Use relative imports — @/ aliases don't resolve inside Vite workers
import { getToEnModel, getFromEnModel } from "../lib/translationModels";

env.allowLocalModels = false;
env.useBrowserCache = true;

const pipelineCache = new Map<string, Awaited<ReturnType<typeof pipeline>>>();

async function ensurePipeline(modelName: string) {
  if (pipelineCache.has(modelName)) return pipelineCache.get(modelName)!;

  const pipe = await pipeline("translation", modelName, {
    progress_callback: (data: Record<string, unknown>) => {
      self.postMessage({ type: "progress", modelName, data });
    },
  });

  pipelineCache.set(modelName, pipe);
  self.postMessage({ type: "model_ready", modelName });
  return pipe;
}

async function runTranslation(modelName: string, text: string): Promise<string> {
  const pipe = await ensurePipeline(modelName);
  const result = await (pipe as any)(text, { max_new_tokens: 512 });
  return (result as any)[0]?.translation_text ?? text;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, id, text, srcLang, tgtLang, modelName } = e.data as {
    type: string;
    id: string;
    text: string;
    srcLang: string;
    tgtLang: string;
    modelName: string;
  };

  // Preload: just download & cache a model without translating
  if (type === "preload") {
    try {
      await ensurePipeline(modelName);
    } catch (err) {
      self.postMessage({ type: "error", id: "preload", modelName, error: (err as Error).message });
    }
    return;
  }

  if (type !== "translate") return;

  try {
    let output = text;

    if (srcLang !== "en") {
      output = await runTranslation(getToEnModel(srcLang), output);
    }

    if (tgtLang !== "en") {
      const model = getFromEnModel(tgtLang);
      if (!model) throw new Error(`Offline translation to "${tgtLang}" is not supported yet.`);
      output = await runTranslation(model, output);
    }

    self.postMessage({ type: "result", id, text: output });
  } catch (err) {
    self.postMessage({ type: "error", id, error: (err as Error).message });
  }
};
