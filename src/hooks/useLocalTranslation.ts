import { useEffect, useRef, useState, useCallback } from "react";
import { ModelProgress } from "@/types";

type Pending = { resolve: (v: string) => void; reject: (e: Error) => void };

export function useLocalTranslation() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<string, Pending>());
  const pendingPreloadsRef = useRef(
    new Map<string, Array<{ resolve: () => void; reject: (e: Error) => void }>>()
  );
  const loadedModelsRef = useRef<Set<string>>(new Set());
  const [modelProgress, setModelProgress] = useState<ModelProgress | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [loadedModels, setLoadedModels] = useState<Set<string>>(new Set());

  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/translation.worker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "progress") {
        const d = msg.data as Record<string, any>;
        const status: string = d.status ?? "";
        if (status === "initiate" || status === "download") {
          setModelProgress((prev) => ({
            modelName: msg.modelName ?? prev?.modelName ?? "translation",
            status: "downloading",
            percent: prev?.percent ?? 0,
            file: d.file,
          }));
        } else if (status === "progress") {
          setModelProgress({
            modelName: msg.modelName ?? "translation",
            status: "downloading",
            percent: Math.round(d.progress ?? 0),
            file: d.file,
          });
        } else if (status === "ready" || status === "done") {
          setModelProgress(null);
        }
      } else if (msg.type === "model_ready") {
        loadedModelsRef.current.add(msg.modelName);
        setLoadedModels((prev) => new Set([...prev, msg.modelName]));
        setModelProgress(null);
        // Resolve any pending preloadModelAsync promises for this model
        const resolvers = pendingPreloadsRef.current.get(msg.modelName);
        if (resolvers) {
          resolvers.forEach(({ resolve }) => resolve());
          pendingPreloadsRef.current.delete(msg.modelName);
        }
      } else if (msg.type === "result") {
        setIsTranslating(false);
        pendingRef.current.get(msg.id)?.resolve(msg.text);
        pendingRef.current.delete(msg.id);
      } else if (msg.type === "error") {
        setIsTranslating(false);
        if (msg.id === "preload") {
          // Preload error — reject the pending promise for this model
          const mn: string = msg.modelName ?? "";
          const entries = pendingPreloadsRef.current.get(mn);
          if (entries) {
            entries.forEach(({ reject }) => reject(new Error(msg.error)));
            pendingPreloadsRef.current.delete(mn);
          }
        } else {
          const p = pendingRef.current.get(msg.id);
          if (p) { p.reject(new Error(msg.error)); pendingRef.current.delete(msg.id); }
        }
      }
    };

    workerRef.current = worker;
    return () => worker.terminate();
  }, []);

  const translate = useCallback(
    (text: string, srcLang: string, tgtLang: string): Promise<string> => {
      if (!text.trim() || srcLang === tgtLang) return Promise.resolve(text);
      setIsTranslating(true);
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        pendingRef.current.set(id, { resolve, reject });
        workerRef.current!.postMessage({ type: "translate", id, text, srcLang, tgtLang });
      });
    },
    []
  );

  /** Eagerly download a specific translation model without translating. */
  const preloadModel = useCallback((modelName: string) => {
    workerRef.current?.postMessage({ type: "preload", modelName });
  }, []);

  /** Like preloadModel() but returns a Promise that resolves when the model is fully ready. */
  const preloadModelAsync = useCallback((modelName: string): Promise<void> => {
    if (loadedModelsRef.current.has(modelName)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const arr = pendingPreloadsRef.current.get(modelName) ?? [];
      arr.push({ resolve, reject });
      pendingPreloadsRef.current.set(modelName, arr);
      workerRef.current?.postMessage({ type: "preload", modelName });
    });
  }, []);

  return { translate, preloadModel, preloadModelAsync, modelProgress, isTranslating, loadedModels };
}
