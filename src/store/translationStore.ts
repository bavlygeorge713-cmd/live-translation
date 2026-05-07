import { create } from "zustand";
import { TranslationEntry, ProcessingState } from "@/types";

export type TranslationProvider = "google" | "deepl";

interface Store {
  // Settings
  sourceLang: string;
  targetLang: string;
  whisperModel: string;
  speechRate: number;
  translationProvider: TranslationProvider;
  deeplApiKey: string;

  // State
  processingState: ProcessingState;
  transcribedText: string;
  translatedText: string;
  latestChunk: string;
  detectedLang: string;
  isPlaying: boolean;
  error: string | null;
  history: TranslationEntry[];

  // Actions
  setSourceLang: (l: string) => void;
  setTargetLang: (l: string) => void;
  setWhisperModel: (m: string) => void;
  setSpeechRate: (r: number) => void;
  setTranslationProvider: (p: TranslationProvider) => void;
  setDeeplApiKey: (k: string) => void;
  setProcessingState: (s: ProcessingState) => void;
  setTranscribedText: (t: string) => void;
  setTranslatedText: (t: string) => void;
  setLatestChunk: (t: string) => void;
  setDetectedLang: (l: string) => void;
  setIsPlaying: (v: boolean) => void;
  setError: (e: string | null) => void;
  addHistory: (entry: TranslationEntry) => void;
  clearHistory: () => void;
  swapLangs: () => void;
  reset: () => void;
}

export const useStore = create<Store>((set, get) => ({
  sourceLang: "auto",
  targetLang: "es",
  whisperModel: "Xenova/whisper-tiny",
  speechRate: 1.0,
  translationProvider: (localStorage.getItem("hy_trans_provider") as TranslationProvider) ?? "google",
  deeplApiKey: localStorage.getItem("hy_deepl_key") ?? "",
  processingState: "idle",
  transcribedText: "",
  translatedText: "",
  latestChunk: "",
  detectedLang: "",
  isPlaying: false,
  error: null,
  history: [],

  setSourceLang: (l) => set({ sourceLang: l }),
  setTargetLang: (l) => set({ targetLang: l }),
  setWhisperModel: (m) => set({ whisperModel: m }),
  setSpeechRate: (r) => set({ speechRate: r }),
  setTranslationProvider: (p) => { localStorage.setItem("hy_trans_provider", p); set({ translationProvider: p }); },
  setDeeplApiKey: (k) => { localStorage.setItem("hy_deepl_key", k); set({ deeplApiKey: k }); },
  setProcessingState: (s) => set({ processingState: s }),
  setTranscribedText: (t) => set({ transcribedText: t }),
  setTranslatedText: (t) => set({ translatedText: t }),
  setLatestChunk: (t) => set({ latestChunk: t }),
  setDetectedLang: (l) => set({ detectedLang: l }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setError: (e) => set({ error: e }),
  addHistory: (entry) =>
    set((s) => ({ history: [entry, ...s.history].slice(0, 60) })),
  clearHistory: () => set({ history: [] }),
  swapLangs: () => {
    const { sourceLang, targetLang } = get();
    if (sourceLang !== "auto") set({ sourceLang: targetLang, targetLang: sourceLang });
  },
  reset: () =>
    set({ transcribedText: "", translatedText: "", latestChunk: "", detectedLang: "", error: null }),
}));
