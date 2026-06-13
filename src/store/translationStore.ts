import { create } from "zustand";
import { TranslationEntry, ProcessingState } from "@/types";

export type TranslationProvider = "groq" | "deepl" | "google" | "auto";

export interface SentenceEntry {
  id: number;
  text: string;
  frozen: boolean;
}

interface Store {
  // Settings
  targetLang: string;
  speechRate: number;
  translationEngine: TranslationProvider;

  // State
  processingState: ProcessingState;
  transcribedText: string;
  translatedText: string;
  draftText: string;
  sentences: SentenceEntry[];
  sentenceHistory: string[];
  pendingTranslation: string;
  latestChunk: string;
  interimChunk: string;
  latestTranscriptChunk: string;
  interimTranscript: string;
  detectedLang: string;
  isPlaying: boolean;
  error: string | null;
  history: TranslationEntry[];
  lastUsedProvider: string;
  batchId: string;

  // Actions
  setTargetLang: (l: string) => void;
  setSpeechRate: (r: number) => void;
  setTranslationEngine: (p: TranslationProvider) => void;
  setProcessingState: (s: ProcessingState) => void;
  setTranscribedText: (t: string) => void;
  setTranslatedText: (t: string) => void;
  setDraftText: (t: string) => void;
  clearDraft: () => void;
  addSentence: (seqId: number) => void;
  appendWordToSentence: (seqId: number, word: string) => void;
  freezeSentence: (seqId: number) => void;
  clearSentences: () => void;
  clearSentenceHistory: () => void;
  setPendingTranslation: (t: string) => void;
  setLatestChunk: (t: string) => void;
  setInterimChunk: (t: string) => void;
  setLatestTranscriptChunk: (t: string) => void;
  setInterimTranscript: (t: string) => void;
  setDetectedLang: (l: string) => void;
  setIsPlaying: (v: boolean) => void;
  setError: (e: string | null) => void;
  addHistory: (entry: TranslationEntry) => void;
  clearHistory: () => void;
  setLastUsedProvider: (p: string) => void;
  setBatchId: (id: string) => void;
  reset: () => void;
}

export const useStore = create<Store>((set) => ({
  targetLang: "ar",
  speechRate: 1.0,
  translationEngine:
    (localStorage.getItem("ct_trans_engine") as TranslationProvider) ?? "auto",
  processingState: "idle",
  transcribedText: "",
  translatedText: "",
  draftText: "",
  sentences: [],
  sentenceHistory: [],
  pendingTranslation: "",
  latestChunk: "",
  interimChunk: "",
  latestTranscriptChunk: "",
  interimTranscript: "",
  detectedLang: "",
  isPlaying: false,
  error: null,
  history: [],
  lastUsedProvider: "",
  batchId: "",

  setTargetLang: (l) => set({ targetLang: l }),
  setSpeechRate: (r) => set({ speechRate: r }),
  setTranslationEngine: (p) => {
    localStorage.setItem("ct_trans_engine", p);
    set({ translationEngine: p });
  },
  setProcessingState: (s) => set({ processingState: s }),
  setTranscribedText: (t) => set({ transcribedText: t }),
  setTranslatedText: (t) => set({ translatedText: t }),
  setDraftText: (t) => set({ draftText: t }),
  clearDraft: () => set({ draftText: "" }),

  addSentence: (seqId) =>
    set((st) => {
      const newEntry: SentenceEntry = { id: seqId, text: "", frozen: false };
      if (st.sentences.length >= 20) {
        // Archive only the contiguous frozen prefix; if the oldest entry is
        // still typing, delay its rollover until it freezes
        let frozenCount = 0;
        while (
          frozenCount < st.sentences.length &&
          st.sentences[frozenCount].frozen
        )
          frozenCount++;
        if (frozenCount > 0) {
          return {
            sentences: [...st.sentences.slice(frozenCount), newEntry],
            sentenceHistory: [
              ...st.sentenceHistory,
              ...st.sentences
                .slice(0, frozenCount)
                .map((s) => s.text)
                .filter(Boolean),
            ],
          };
        }
      }
      return { sentences: [...st.sentences, newEntry] };
    }),

  appendWordToSentence: (seqId, word) =>
    set((st) => {
      const idx = st.sentences.findIndex((s) => s.id === seqId);
      if (idx < 0) return st;
      const updated = [...st.sentences];
      const cur = updated[idx];
      updated[idx] = { ...cur, text: cur.text ? cur.text + " " + word : word };
      return { sentences: updated };
    }),

  freezeSentence: (seqId) =>
    set((st) => {
      const idx = st.sentences.findIndex((s) => s.id === seqId);
      if (idx < 0 || st.sentences[idx].frozen) return st;
      const updated = [...st.sentences];
      updated[idx] = { ...updated[idx], frozen: true };
      return { sentences: updated };
    }),

  clearSentences: () => set({ sentences: [] }),
  clearSentenceHistory: () => set({ sentenceHistory: [] }),
  setPendingTranslation: (t) => set({ pendingTranslation: t }),
  setLatestChunk: (t) => set({ latestChunk: t }),
  setInterimChunk: (t) => set({ interimChunk: t }),
  setLatestTranscriptChunk: (t) => set({ latestTranscriptChunk: t }),
  setInterimTranscript: (t) => set({ interimTranscript: t }),
  setDetectedLang: (l) => set({ detectedLang: l }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setError: (e) => set({ error: e }),
  addHistory: (entry) =>
    set((s) => ({ history: [entry, ...s.history].slice(0, 60) })),
  clearHistory: () => set({ history: [] }),
  setLastUsedProvider: (p) => set({ lastUsedProvider: p }),
  setBatchId: (id) => set({ batchId: id }),
  reset: () =>
    set({
      transcribedText: "",
      translatedText: "",
      draftText: "",
      sentences: [],
      sentenceHistory: [],
      pendingTranslation: "",
      latestChunk: "",
      interimChunk: "",
      latestTranscriptChunk: "",
      interimTranscript: "",
      detectedLang: "",
      error: null,
      lastUsedProvider: "",
    }),
}));
