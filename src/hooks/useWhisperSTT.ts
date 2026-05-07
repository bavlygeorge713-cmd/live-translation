import { useEffect, useRef, useState, useCallback } from "react";
import { ModelProgress } from "@/types";

type Pending = { resolve: (v: string) => void; reject: (e: Error) => void };

export function useWhisperSTT() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, Pending>());
  const pendingPreloadsRef = useRef(
    new Map<string, Array<{ resolve: () => void; reject: (e: Error) => void }>>()
  );
  const loadedModelIdRef = useRef<string | null>(null);

  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null);
  const [isModelReady, setIsModelReady] = useState(false);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [cachedModels, setCachedModels] = useState<Set<string>>(new Set());

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/whisper.worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as Record<string, any>;

      if (msg.type === "loading") {
        // Worker acknowledged preload — model is being fetched
        setIsModelReady(false);
        setModelProgress({
          modelName: msg.modelId ?? "whisper",
          status: "loading",
          percent: 0,
        });

      } else if (msg.type === "progress") {
        // @xenova/transformers v2 progress_callback fires these statuses:
        //   "initiate"  — a file is about to be fetched
        //   "download"  — large file download started (has progress=0)
        //   "progress"  — download in flight (has progress 0-100)
        //   "done"      — one file finished
        //   "ready"     — the whole pipeline is ready
        const d = msg.data as Record<string, any>;
        const status: string = d.status ?? "";

        if (status === "ready") {
          // pipeline itself emits "ready" inside the callback too
          setIsModelReady(true);
          setLoadedModelId(msg.modelId ?? null);
          setModelProgress(null);
        } else if (status === "progress") {
          setModelProgress({
            modelName: d.name ?? "whisper",
            status: "downloading",
            percent: Math.round(d.progress ?? 0),
            file: d.file,
          });
        } else if (status === "initiate" || status === "download") {
          setModelProgress((prev) => ({
            modelName: d.name ?? prev?.modelName ?? "whisper",
            status: "downloading",
            percent: prev?.percent ?? 0,
            file: d.file,
          }));
        }
        // "done" per file — keep showing current progress, no reset

      } else if (msg.type === "ready") {
        // Worker-level "ready" sent after pipeline() resolves
        const readyId: string = msg.modelId ?? "";
        setIsModelReady(true);
        setLoadedModelId(readyId || null);
        loadedModelIdRef.current = readyId || null;
        setCachedModels((prev) => new Set([...prev, readyId]));
        setModelProgress(null);
        // Resolve any pending preloadAsync promises for this model
        const resolvers = pendingPreloadsRef.current.get(readyId);
        if (resolvers) {
          resolvers.forEach(({ resolve }) => resolve());
          pendingPreloadsRef.current.delete(readyId);
        }

      } else if (msg.type === "result") {
        setIsTranscribing(false);
        pendingRef.current.get(msg.id)?.resolve(msg.text ?? "");
        pendingRef.current.delete(msg.id);

      } else if (msg.type === "error") {
        setIsTranscribing(false);
        setModelProgress(null);
        if (msg.id === "preload") {
          // Preload failure — reject all pending preloadAsync promises for this model
          const mid: string = msg.modelId ?? "";
          const entries = pendingPreloadsRef.current.get(mid);
          if (entries) {
            entries.forEach(({ reject }) => reject(new Error(msg.error)));
            pendingPreloadsRef.current.delete(mid);
          } else {
            // No specific model id — reject everything pending
            for (const [, ents] of pendingPreloadsRef.current.entries()) {
              ents.forEach(({ reject }) => reject(new Error(msg.error)));
            }
            pendingPreloadsRef.current.clear();
          }
        } else {
          const p = pendingRef.current.get(msg.id);
          if (p) {
            p.reject(new Error(msg.error));
            pendingRef.current.delete(msg.id);
          } else {
            console.error("[Whisper Worker]", msg.error);
          }
        }
      }
    };

    worker.onerror = (err) => {
      console.error("[Whisper Worker fatal]", err);
      setModelProgress(null);
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Eagerly download & load a model before the user speaks.
   *  Sets state immediately so the UI responds on click. */
  const preload = useCallback((modelId: string) => {
    // Instant UI feedback — don't wait for the worker to reply
    setIsModelReady(false);
    setModelProgress({
      modelName: modelId,
      status: "loading",
      percent: 0,
    });
    workerRef.current?.postMessage({ type: "preload", modelId });
  }, []);

  /** Like preload() but returns a Promise that resolves when the model is fully ready. */
  const preloadAsync = useCallback((modelId: string): Promise<void> => {
    if (loadedModelIdRef.current === modelId) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const arr = pendingPreloadsRef.current.get(modelId) ?? [];
      arr.push({ resolve, reject });
      pendingPreloadsRef.current.set(modelId, arr);
      setIsModelReady(false);
      setModelProgress({ modelName: modelId, status: "loading", percent: 0 });
      workerRef.current?.postMessage({ type: "preload", modelId });
    });
  }, []);

  const transcribe = useCallback(
    (audio: Float32Array, language: string, modelId: string): Promise<string> => {
      setIsTranscribing(true);
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        pendingRef.current.set(id, { resolve, reject });
        workerRef.current!.postMessage(
          { type: "transcribe", id, audio, language, modelId },
          [audio.buffer]
        );
      });
    },
    []
  );

  return {
    transcribe,
    preload,
    preloadAsync,
    modelProgress,
    isModelReady,
    loadedModelId,
    isTranscribing,
    cachedModels,
  };
}
