import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Square,
  AlertCircle,
  Volume2,
  VolumeX,
  RefreshCw,
} from "lucide-react";
import { useAudioDevices } from "@/hooks/useMicrophone";
import { useWebSpeechSTT } from "@/hooks/useWebSpeechSTT";
import { useWhisperSTT, type WhisperFailReason } from "@/hooks/useWhisperSTT";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useStore } from "@/store/translationStore";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { LANGUAGES } from "@/types";
import {
  createWordPacer,
  type PacedWord,
  type WordPacer,
} from "@/lib/wordPacer";
import type { BroadcastMessage } from "@/hooks/useBroadcast";

const SRC_LANGUAGES = [
  { bcp47: "en-US", name: "Auto (English default)" },
  { bcp47: "ar-EG", name: "Arabic / Egyptian" },
  { bcp47: "fr-FR", name: "French" },
  { bcp47: "es-ES", name: "Spanish" },
  { bcp47: "de-DE", name: "German" },
  { bcp47: "it-IT", name: "Italian" },
  { bcp47: "pt-BR", name: "Portuguese (Brazil)" },
  { bcp47: "ru-RU", name: "Russian" },
  { bcp47: "zh-CN", name: "Chinese (Simplified)" },
  { bcp47: "ja-JP", name: "Japanese" },
  { bcp47: "tr-TR", name: "Turkish" },
  { bcp47: "ko-KR", name: "Korean" },
];

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

async function translateAndPublishForLang(
  rawChunk: string,
  langCode: string,
  sourceLangCode: string,
  seqId: number,
  batchId: string,
  publish: (lang: string, msg: BroadcastMessage) => void,
  roomId: string,
): Promise<void> {
  const srcHint = LANG_NAMES[sourceLangCode]
    ? `The speaker is speaking ${LANG_NAMES[sourceLangCode]}. `
    : "";

  let translated = "";

  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: rawChunk, to: langCode, srcHint, roomId }),
    });
    if (res.ok) {
      const data = (await res.json()) as { translation?: string };
      translated = data.translation?.trim() ?? "";
    }
  } catch {
    /* fall through to GTX */
  }

  if (!translated) {
    try {
      const url =
        `https://translate.googleapis.com/translate_a/single` +
        `?client=gtx&sl=${encodeURIComponent(sourceLangCode)}&tl=${encodeURIComponent(langCode)}&dt=t` +
        `&q=${encodeURIComponent(rawChunk)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as any[][][];
        translated = ((data[0] ?? []) as any[])
          .map((item: any) => item[0] as string)
          .filter(Boolean)
          .join("")
          .trim();
      }
    } catch {
      /* drop chunk if both fail */
    }
  }

  if (!translated) return;

  publish(langCode, {
    type: "translation",
    chunk: translated,
    transcript: rawChunk,
    sourceLang: sourceLangCode,
    targetLang: langCode,
    isFinal: true,
    seqId,
    batchId,
  });
}

const GROQ_GUARD_PHRASES = [
  "what do you",
  "do you want",
  "i think",
  "let me",
  "can you",
  "it looks",
];

type RecognitionEngine = "whisper" | "browser";

const groqKey1 = { cooldownUntil: 0 };
const groqKey2 = { cooldownUntil: 0 };

function passesGuards(rawChunk: string, groqText: string): boolean {
  if (!rawChunk.includes("?") && groqText.endsWith("?")) return false;
  const lower = groqText.toLowerCase();
  if (GROQ_GUARD_PHRASES.some((p) => lower.includes(p))) return false;
  return true;
}

// Side effects to run when a chunk's last word drains and its sentence freezes
interface FreezeCtx {
  finalText: string;
  rawChunk: string;
  sourceLang: string;
  targetLang: string;
  bcp47: string;
  speechRate: number;
}

interface Props {
  onStream: (s: MediaStream | null) => void;
  send: (msg: BroadcastMessage) => void;
  roomId?: string;
  requestedLangs: ReadonlySet<string>;
  publishToLang: (lang: string, msg: BroadcastMessage) => void;
}

export function MicrophonePanel({ onStream, send, roomId, requestedLangs, publishToLang }: Props) {
  const store = useStore();
  const { devices, refresh: refreshDevices } = useAudioDevices();
  const webSpeech = useWebSpeechSTT();
  const whisper = useWhisperSTT();
  const tts = useSpeechSynthesis();

  // ── Recording guard ───────────────────────────────────────────────────────
  const isRecordingRef = useRef(false);

  // ── Chunk sequence ────────────────────────────────────────────────────────
  const chunkSeqRef = useRef(0);

  // ── Abort map (per-chunk abort controllers) ───────────────────────────────
  const abortMapRef = useRef<Map<number, AbortController>>(new Map());

  // ── Misc ──────────────────────────────────────────────────────────────────
  const currentBatchIdRef = useRef("");

  // ── Stable refs ───────────────────────────────────────────────────────────
  const latestRef = useRef({
    targetLang: store.targetLang,
    speechRate: store.speechRate,
  });
  latestRef.current = {
    targetLang: store.targetLang,
    speechRate: store.speechRate,
  };
  const storeRef = useRef(store);
  storeRef.current = store;
  const sendRef = useRef(send);
  sendRef.current = send;
  const requestedLangsRef = useRef(requestedLangs);
  requestedLangsRef.current = requestedLangs;
  const publishToLangRef = useRef(publishToLang);
  publishToLangRef.current = publishToLang;
  const webSpeechRef = useRef(webSpeech);
  webSpeechRef.current = webSpeech;
  const whisperRef = useRef(whisper);
  whisperRef.current = whisper;

  // ── Recognition engine — Whisper (Groq) default, browser Web Speech fallback ─
  const [engine, setEngine] = useState<RecognitionEngine>(
    () =>
      (localStorage.getItem("ct_stt_engine") as RecognitionEngine) || "whisper",
  );
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [engineNotice, setEngineNotice] = useState<string | null>(null);

  const handleEngineChange = (next: RecognitionEngine) => {
    setEngine(next);
    engineRef.current = next;
    localStorage.setItem("ct_stt_engine", next);
    setEngineNotice(null);
    stopWhisperRecovery(); // a manual choice must never be auto-overridden
  };

  // ── Source language ───────────────────────────────────────────────────────
  const [selectedSrcLang, setSelectedSrcLang] = useState(
    () => localStorage.getItem("ct_src_lang") || "en-US",
  );
  const selectedSrcLangRef = useRef(
    localStorage.getItem("ct_src_lang") || "en-US",
  );
  selectedSrcLangRef.current = selectedSrcLang;

  const handleSrcLangChange = useCallback((bcp47: string) => {
    setSelectedSrcLang(bcp47);
    localStorage.setItem("ct_src_lang", bcp47);
    if (isRecordingRef.current) {
      if (engineRef.current === "whisper") {
        // Whisper advantage: just retag future windows — no restart needed
        whisperRef.current.setLanguage(bcp47);
      } else {
        webSpeechRef.current.restart(bcp47);
      }
    }
  }, []);

  // ── Voice selector ────────────────────────────────────────────────────────
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const selectedVoiceURIRef = useRef("");
  selectedVoiceURIRef.current = selectedVoiceURI;
  useEffect(() => {
    setSelectedVoiceURI("");
  }, [store.targetLang]);

  // ── Host mute ─────────────────────────────────────────────────────────────
  const [hostMuted, setHostMuted] = useState(
    () => localStorage.getItem("ct_host_muted") === "true",
  );
  const hostMutedRef = useRef(hostMuted);
  hostMutedRef.current = hostMuted;

  // ── Component state ───────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [visualStream, setVisualStream] = useState<MediaStream | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const visualStreamRef = useRef<MediaStream | null>(null);
  visualStreamRef.current = visualStream;

  // ── Hybrid-mode state — Whisper + WebSpeech run simultaneously ───────────
  const isHybridModeRef = useRef(false);
  const draftRawTextRef = useRef("");
  const interimDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const draftAbortRef = useRef<AbortController | null>(null);

  // ── Host TTS queue — frozen sentences speak sequentially, never cancelled
  //    mid-speech; onend chains the next utterance ───────────────────────────
  const hostTtsQueueRef = useRef<
    Array<{ text: string; bcp47: string; rate: number }>
  >([]);
  const hostTtsBusyRef = useRef(false);
  const drainHostTtsRef = useRef<() => void>(() => {});

  drainHostTtsRef.current = () => {
    if (hostTtsBusyRef.current || hostTtsQueueRef.current.length === 0) return;
    if (hostMutedRef.current) {
      hostTtsQueueRef.current = [];
      return;
    }

    const { text, bcp47, rate } = hostTtsQueueRef.current.shift()!;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = bcp47;
    utter.rate = rate;

    const voices = window.speechSynthesis.getVoices();
    const uri = selectedVoiceURIRef.current;
    const match = uri
      ? voices.find((v) => v.voiceURI === uri)
      : (voices.find((v) => v.lang === bcp47) ??
        voices.find((v) => v.lang.startsWith(bcp47.split("-")[0])));
    if (match) utter.voice = match;

    hostTtsBusyRef.current = true;
    storeRef.current.setIsPlaying(true);

    const finish = () => {
      if (!hostTtsBusyRef.current) return;
      hostTtsBusyRef.current = false;
      if (hostTtsQueueRef.current.length === 0)
        storeRef.current.setIsPlaying(false);
      drainHostTtsRef.current();
    };
    const safetyTimer = setTimeout(finish, 30_000);
    utter.onend = () => {
      clearTimeout(safetyTimer);
      finish();
    };
    utter.onerror = () => {
      clearTimeout(safetyTimer);
      finish();
    };

    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utter);
    } catch {
      clearTimeout(safetyTimer);
      finish();
    }
  };

  const queueHostTts = useCallback(
    (text: string, bcp47: string, rate: number) => {
      if (hostMutedRef.current || !text.trim()) return;
      hostTtsQueueRef.current.push({ text, bcp47, rate });
      drainHostTtsRef.current();
    },
    [],
  );

  const stopHostTts = useCallback(() => {
    hostTtsQueueRef.current = [];
    hostTtsBusyRef.current = false;
    window.speechSynthesis.cancel();
    storeRef.current.setIsPlaying(false);
  }, []);

  const clearDraftState = useCallback(() => {
    if (interimDraftTimerRef.current) {
      clearTimeout(interimDraftTimerRef.current);
      interimDraftTimerRef.current = null;
    }
    if (draftAbortRef.current) {
      draftAbortRef.current.abort();
      draftAbortRef.current = null;
    }
    draftRawTextRef.current = "";
    storeRef.current.clearDraft();
  }, []);

  const toggleHostMute = () => {
    const next = !hostMuted;
    setHostMuted(next);
    hostMutedRef.current = next;
    localStorage.setItem("ct_host_muted", String(next));
    if (next) stopHostTts();
  };

  // ── Word pacer — the ONLY path that writes sentence text to the screen ────
  const pendingFreezeRef = useRef<Map<number, FreezeCtx>>(new Map());

  const onPacedWordRef = useRef<(item: PacedWord) => void>(() => {});
  onPacedWordRef.current = (item) => {
    const st = useStore.getState();
    // Slot is created when the chunk's first word drains — no empty placeholders
    if (!st.sentences.some((s) => s.id === item.seqId))
      st.addSentence(item.seqId);
    st.appendWordToSentence(item.seqId, item.word);
    if (!item.isLast) return;

    st.freezeSentence(item.seqId);
    const ctx = pendingFreezeRef.current.get(item.seqId);
    pendingFreezeRef.current.delete(item.seqId);
    if (!ctx) return;

    st.setTranslatedText(ctx.finalText);
    st.setProcessingState("idle");
    queueHostTts(ctx.finalText, ctx.bcp47, ctx.speechRate);
    st.addHistory({
      id: crypto.randomUUID(),
      originalText: ctx.rawChunk,
      translatedText: ctx.finalText,
      sourceLang: ctx.sourceLang,
      targetLang: ctx.targetLang,
      timestamp: new Date(),
    });
  };

  const pacerRef = useRef<WordPacer | null>(null);
  const getPacer = useCallback(() => {
    if (!pacerRef.current) {
      pacerRef.current = createWordPacer((item) =>
        onPacedWordRef.current(item),
      );
    }
    return pacerRef.current;
  }, []);

  useEffect(
    () => () => {
      pacerRef.current?.clear();
      hostTtsQueueRef.current = [];
      whisperRef.current.stop();
      if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
      if (interimDraftTimerRef.current)
        clearTimeout(interimDraftTimerRef.current);
      if (draftAbortRef.current) draftAbortRef.current.abort();
    },
    [],
  );

  // ── Core chunk processor — GTX is what users see; Groq fires only as a
  //    fallback when GTX failed/timed out ────────────────────────────────────
  const processChunkRef = useRef(async (_seqId: number, _raw: string) => {});
  processChunkRef.current = async (seqId: number, rawChunk: string) => {
    if (!isRecordingRef.current) return;

    const { targetLang, speechRate } = latestRef.current;
    const sl = selectedSrcLangRef.current.split("-")[0];
    const bcp47 =
      LANGUAGES.find((l) => l.code === targetLang)?.bcp47 ?? "en-US";
    const srcHint = LANG_NAMES[sl]
      ? `The speaker is speaking ${LANG_NAMES[sl]}. `
      : "";

    const chunkCtrl = new AbortController();
    abortMapRef.current.set(seqId, chunkCtrl);

    const fetchGtx = async (): Promise<string> => {
      const gtxCtrl = new AbortController();
      const timer = setTimeout(() => gtxCtrl.abort(), 1200);
      const onCancel = () => gtxCtrl.abort();
      chunkCtrl.signal.addEventListener("abort", onCancel, { once: true });
      try {
        const url =
          `https://translate.googleapis.com/translate_a/single` +
          `?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(targetLang)}&dt=t` +
          `&q=${encodeURIComponent(rawChunk)}`;
        const res = await fetch(url, { signal: gtxCtrl.signal });
        if (!res.ok) return "";
        const data = (await res.json()) as any[][][];
        return (data[0] as any[])
          .map((item: any) => item[0])
          .filter(Boolean)
          .join("")
          .trim();
      } catch {
        return "";
      } finally {
        clearTimeout(timer);
        chunkCtrl.signal.removeEventListener("abort", onCancel);
      }
    };

    const tryGroqKey = async (keyPref: 0 | 1): Promise<string> => {
      const groqCtrl = new AbortController();
      const timer = setTimeout(() => groqCtrl.abort(), 3000);
      const onCancel = () => groqCtrl.abort();
      chunkCtrl.signal.addEventListener("abort", onCancel, { once: true });
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: rawChunk,
            to: targetLang,
            srcHint,
            roomId: roomId ?? "",
            keyPref,
          }),
          signal: groqCtrl.signal,
        });
        if (res.status === 429) {
          const e: any = new Error("429");
          e.is429 = true;
          throw e;
        }
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        return (data.translation as string | undefined)?.trim() ?? "";
      } finally {
        clearTimeout(timer);
        chunkCtrl.signal.removeEventListener("abort", onCancel);
      }
    };

    const fetchGroqFallback = async (): Promise<string> => {
      const keys: Array<[0 | 1, { cooldownUntil: number }]> = [
        [0, groqKey1],
        [1, groqKey2],
      ];
      for (const [keyPref, keyState] of keys) {
        if (chunkCtrl.signal.aborted) return "";
        if (Date.now() < keyState.cooldownUntil) continue;
        try {
          const text = await tryGroqKey(keyPref);
          if (text && passesGuards(rawChunk, text)) return text;
        } catch (e: any) {
          if (e?.is429) keyState.cooldownUntil = Date.now() + 60_000;
        }
      }
      return "";
    };

    let text = await fetchGtx();
    if (!text && !chunkCtrl.signal.aborted) text = await fetchGroqFallback();
    if (!text && !chunkCtrl.signal.aborted) {
      // Both engines failed — retry GTX once after 1s
      await new Promise((r) => setTimeout(r, 1000));
      if (!chunkCtrl.signal.aborted) text = await fetchGtx();
    }
    // Last resort: surface the raw source transcript so the chunk never vanishes
    if (!text) text = rawChunk;

    abortMapRef.current.delete(seqId);
    if (!isRecordingRef.current || chunkCtrl.signal.aborted) return;

    pendingFreezeRef.current.set(seqId, {
      finalText: text,
      rawChunk,
      sourceLang: sl,
      targetLang,
      bcp47,
      speechRate,
    });
    // Host pacer enqueues first so host pixels appear immediately;
    // broadcast fires after (both sync — neither blocks the other)
    getPacer().enqueue(seqId, text);
    sendRef.current({
      type: "translation",
      chunk: text,
      transcript: rawChunk,
      interimChunk: "",
      interimTranscript: "",
      sourceLang: sl,
      targetLang,
      isFinal: true,
      seqId,
      batchId: currentBatchIdRef.current,
    });

    // Per-language translations — one server-side Groq call per distinct viewer language
    const langs = requestedLangsRef.current;
    if (langs.size > 0) {
      const batchId = currentBatchIdRef.current;
      for (const langCode of langs) {
        if (langCode === targetLang) continue; // host's targetLang already on base channel
        void translateAndPublishForLang(
          rawChunk,
          langCode,
          sl,
          seqId,
          batchId,
          publishToLangRef.current,
          roomId ?? "",
        );
      }
    }
  };

  // ── handleFinal — fires when a recognition window stops in a micro-pause ──
  const handleFinal = useCallback((rawText: string) => {
    if (!isRecordingRef.current) return;
    const trimmed = rawText.trim();
    if (!trimmed) return;

    const thisSeq = ++chunkSeqRef.current;
    storeRef.current.setInterimTranscript(trimmed);
    storeRef.current.setProcessingState("translating");

    void processChunkRef.current(thisSeq, trimmed);
  }, []);

  const handleWebSpeechError = useCallback((errCode: string) => {
    if (!isRecordingRef.current) return;
    const msg =
      errCode === "not-allowed"
        ? "Microphone permission denied. Allow mic access and try again."
        : errCode === "network"
          ? "Speech recognition network error. Check your internet connection."
          : errCode === "audio-capture"
            ? "Microphone not found or in use by another app."
            : `Speech recognition error: ${errCode}`;
    setError(msg);
    storeRef.current.setError(msg);
  }, []);

  // ── Hybrid draft: Web Speech interim → GTX → dim display ─────────────────
  const handleInterimRef = useRef<(text: string) => void>(() => {});
  const handleInterim = useCallback((interimText: string) => {
    if (!isRecordingRef.current || !isHybridModeRef.current) return;
    draftRawTextRef.current = interimText;
    if (interimDraftTimerRef.current)
      clearTimeout(interimDraftTimerRef.current);
    interimDraftTimerRef.current = setTimeout(async () => {
      if (!isRecordingRef.current || !isHybridModeRef.current) return;
      if (draftAbortRef.current) draftAbortRef.current.abort();
      draftAbortRef.current = new AbortController();
      const ctrl = draftAbortRef.current;
      const sl = selectedSrcLangRef.current.split("-")[0];
      const { targetLang } = latestRef.current;
      const url =
        `https://translate.googleapis.com/translate_a/single` +
        `?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(targetLang)}&dt=t` +
        `&q=${encodeURIComponent(interimText)}`;
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok || ctrl.signal.aborted) return;
        const data = (await res.json()) as any[][][];
        const t = (data[0] as any[])
          .map((item: any) => item[0])
          .filter(Boolean)
          .join("")
          .trim();
        if (!ctrl.signal.aborted && t) storeRef.current.setDraftText(t);
      } catch {
        /* AbortError or network */
      }
    }, 250);
  }, []);
  handleInterimRef.current = handleInterim;

  // ── Whisper final: confirmed text replaces the draft ─────────────────────
  const handleWhisperFinalRef = useRef<(text: string) => void>(() => {});
  const handleWhisperFinal = useCallback(
    (rawText: string) => {
      if (!isRecordingRef.current) return;
      const trimmed = rawText.trim();
      clearDraftState();
      if (!trimmed) return; // silent window discard — no action
      const thisSeq = ++chunkSeqRef.current;
      storeRef.current.setInterimTranscript(trimmed);
      storeRef.current.setProcessingState("translating");
      void processChunkRef.current(thisSeq, trimmed);
    },
    [clearDraftState],
  );
  handleWhisperFinalRef.current = handleWhisperFinal;

  // ── Whisper window fail: promote draft as confirmed fallback ──────────────
  const handleWindowFailRef = useRef<() => void>(() => {});
  const handleWindowFail = useCallback(() => {
    if (!isRecordingRef.current || !isHybridModeRef.current) return;
    const rawFallback = draftRawTextRef.current.trim();
    clearDraftState();
    if (!rawFallback) return;
    const thisSeq = ++chunkSeqRef.current;
    storeRef.current.setInterimTranscript(rawFallback);
    storeRef.current.setProcessingState("translating");
    void processChunkRef.current(thisSeq, rawFallback);
  }, [clearDraftState]);
  handleWindowFailRef.current = handleWindowFail;

  // ── Whisper auto-fallback + auto-recovery ─────────────────────────────────
  const autoFallbackRef = useRef(false); // fallback was automatic (not the user's choice)
  const recoveryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleWhisperUnavailableRef = useRef<
    (reason: WhisperFailReason) => void
  >(() => {});

  const stopWhisperRecovery = useCallback(() => {
    if (recoveryTimerRef.current) {
      clearInterval(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    autoFallbackRef.current = false;
  }, []);

  // After an automatic fallback, probe Whisper every 60s with a tiny silent
  // blob; when it answers again, switch back without interrupting recording
  const startWhisperRecovery = useCallback(() => {
    if (recoveryTimerRef.current) clearInterval(recoveryTimerRef.current);
    recoveryTimerRef.current = setInterval(async () => {
      if (
        !isRecordingRef.current ||
        !autoFallbackRef.current ||
        engineRef.current !== "browser"
      ) {
        stopWhisperRecovery();
        return;
      }
      const healthy = await whisperRef.current.healthCheck();
      if (!healthy) return;
      if (
        !isRecordingRef.current ||
        !autoFallbackRef.current ||
        engineRef.current !== "browser"
      )
        return;

      webSpeechRef.current.stop();
      const started = await whisperRef.current.start({
        stream: visualStreamRef.current,
        lang: selectedSrcLangRef.current,
        onFinal: (t) => handleWhisperFinalRef.current(t),
        onWindowFail: () => handleWindowFailRef.current(),
        onUnavailable: (reason) => handleWhisperUnavailableRef.current(reason),
      });
      if (started) {
        stopWhisperRecovery();
        engineRef.current = "whisper";
        setEngine("whisper");
        setEngineNotice("Whisper recognition restored");
        // Restore hybrid mode: restart Web Speech as draft-only
        webSpeechRef.current.stop();
        isHybridModeRef.current = true;
        webSpeechRef.current.start(
          selectedSrcLangRef.current,
          () => {},
          handleWebSpeechError,
          (t) => handleInterimRef.current(t),
        );
      } else {
        // Health check passed but the recorder couldn't start — stay on browser
        webSpeechRef.current.start(
          selectedSrcLangRef.current,
          handleFinal,
          handleWebSpeechError,
        );
      }
    }, 60_000);
  }, [handleFinal, handleWebSpeechError, stopWhisperRecovery]);

  // Automatic fallback: Whisper reported it can't continue (sustained rate
  // limiting or repeated server errors) — switch to the browser engine
  // without interrupting the recording session, then try to recover
  const handleWhisperUnavailable = useCallback(
    (reason: WhisperFailReason) => {
      if (!isRecordingRef.current || engineRef.current !== "whisper") return;
      whisperRef.current.stop();
      engineRef.current = "browser";
      setEngine("browser");
      setEngineNotice(
        reason === "rate-limit"
          ? "Switched to browser recognition (rate limited)"
          : "Switched to browser recognition (server error)",
      );
      autoFallbackRef.current = true;
      isHybridModeRef.current = false;
      clearDraftState();
      startWhisperRecovery();
      // Web Speech may already be running as the draft engine — restart it as the sole engine
      webSpeechRef.current.stop();
      const ok = webSpeechRef.current.start(
        selectedSrcLangRef.current,
        handleFinal,
        handleWebSpeechError,
      );
      if (!ok) {
        setError("Speech recognition unavailable. Stop and start again.");
        storeRef.current.setError("Speech recognition unavailable.");
      }
    },
    [handleFinal, handleWebSpeechError, startWhisperRecovery, clearDraftState],
  );
  handleWhisperUnavailableRef.current = handleWhisperUnavailable;

  // ── Toggle recording ──────────────────────────────────────────────────────
  const toggle = async () => {
    setError(null);

    if (isRecording) {
      isRecordingRef.current = false;
      isHybridModeRef.current = false;

      abortMapRef.current.forEach((ctrl) => ctrl.abort());
      abortMapRef.current.clear();
      clearDraftState();

      // Type out anything still queued instantly and freeze those lines
      getPacer().flush();
      pendingFreezeRef.current.clear();
      stopHostTts();

      chunkSeqRef.current = 0;
      currentBatchIdRef.current = "";

      stopWhisperRecovery();
      whisperRef.current.stop();
      webSpeech.stop();
      visualStream?.getTracks().forEach((t) => t.stop());
      setVisualStream(null);
      setIsRecording(false);
      onStream(null);
      storeRef.current.setInterimTranscript("");
      storeRef.current.setTranscribedText("");
      storeRef.current.setProcessingState("idle");
    } else {
      storeRef.current.setError(null);
      storeRef.current.setTranscribedText("");
      storeRef.current.setTranslatedText("");
      storeRef.current.setLatestChunk("");
      storeRef.current.setInterimChunk("");
      storeRef.current.setInterimTranscript("Listening…");
      storeRef.current.clearSentences();

      chunkSeqRef.current = 0;
      currentBatchIdRef.current = crypto.randomUUID();
      abortMapRef.current.clear();
      getPacer().clear();
      pendingFreezeRef.current.clear();
      stopHostTts();
      clearDraftState();
      setEngineNotice(null);
      stopWhisperRecovery();

      const wantWhisper =
        engineRef.current === "whisper" && whisper.isSupported;
      if (!wantWhisper && !webSpeech.isSupported) {
        setError("Live speech requires Chrome or Edge.");
        return;
      }

      let vs: MediaStream | null = null;
      try {
        vs = await navigator.mediaDevices.getUserMedia({
          audio: selectedDeviceId
            ? {
                deviceId: { exact: selectedDeviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }
            : {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
        });
      } catch {
        setError("Microphone access denied. Check browser permissions.");
        return;
      }

      // isRecordingRef must be true before the engine starts — whisper's first
      // transcription can resolve into handleFinal almost immediately
      isRecordingRef.current = true;
      isHybridModeRef.current = false;

      let started = false;
      if (wantWhisper) {
        started = await whisper.start({
          stream: vs,
          lang: selectedSrcLang,
          onFinal: (t) => handleWhisperFinalRef.current(t),
          onWindowFail: () => handleWindowFailRef.current(),
          onUnavailable: handleWhisperUnavailable,
        });
        if (started && webSpeech.isSupported) {
          // Run Web Speech in parallel for the live draft tier
          webSpeech.start(
            selectedSrcLang,
            () => {},
            handleWebSpeechError,
            (t) => handleInterimRef.current(t),
          );
          isHybridModeRef.current = true;
        }
      }
      if (!started && webSpeech.isSupported) {
        // Pure browser fallback — Web Speech is the sole engine
        started = webSpeech.start(
          selectedSrcLang,
          handleFinal,
          handleWebSpeechError,
        );
        if (started && engineRef.current === "whisper") {
          engineRef.current = "browser";
          setEngine("browser");
          setEngineNotice("Switched to browser recognition");
        }
      }

      if (!started) {
        isRecordingRef.current = false;
        vs?.getTracks().forEach((t) => t.stop());
        setError(
          "Could not start speech recognition. Try refreshing the page.",
        );
        return;
      }

      setIsRecording(true);
      setVisualStream(vs);
      onStream(vs);
    }
  };

  return (
    <GlassCard glow="blue" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Microphone</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live · {engine === "whisper" ? "Groq Whisper" : "Web Speech API"}
          </p>
        </div>
        <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Mic className="size-4 text-blue-400" />
        </div>
      </div>

      {/* Device selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            Audio Input
          </label>
          <button
            onClick={refreshDevices}
            className="text-slate-600 hover:text-slate-400 transition-colors"
          >
            <RefreshCw className="size-3" />
          </button>
        </div>
        <div className="relative">
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            disabled={isRecording}
            className="w-full appearance-none bg-white/5 border border-white/10 text-slate-300
              text-xs rounded-lg px-3 py-2 pr-7 outline-none cursor-pointer
              disabled:opacity-40 disabled:cursor-not-allowed focus:border-blue-500/40 transition-colors"
          >
            <option value="" className="bg-[#111114]">
              Default microphone
            </option>
            {devices.map((d) => (
              <option
                key={d.deviceId}
                value={d.deviceId}
                className="bg-[#111114]"
              >
                {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs">
            ▾
          </span>
        </div>
      </div>

      {/* Speaking language selector */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
          Speaking Language:
        </label>
        <div className="relative">
          <select
            value={selectedSrcLang}
            onChange={(e) => handleSrcLangChange(e.target.value)}
            className="w-full appearance-none bg-white/[0.08] border border-white/20 text-slate-200
              text-xs rounded-lg px-3 py-2 pr-7 outline-none cursor-pointer
              focus:border-blue-500/50 transition-colors"
          >
            {SRC_LANGUAGES.map((l) => (
              <option key={l.bcp47} value={l.bcp47} className="bg-[#111114]">
                {l.name}
              </option>
            ))}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs">
            ▾
          </span>
        </div>
      </div>

      {/* Recognition engine toggle */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
          Recognition
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => handleEngineChange("whisper")}
            disabled={isRecording}
            className={`text-xs rounded-lg px-3 py-2 border transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed ${
                engine === "whisper"
                  ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
              }`}
          >
            Whisper <span className="text-[10px] opacity-70">(accurate)</span>
          </button>
          <button
            onClick={() => handleEngineChange("browser")}
            disabled={isRecording}
            className={`text-xs rounded-lg px-3 py-2 border transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed ${
                engine === "browser"
                  ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
                  : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20"
              }`}
          >
            Browser <span className="text-[10px] opacity-70">(instant)</span>
          </button>
        </div>
      </div>

      {/* Engine fallback notice */}
      {engineNotice && (
        <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          <AlertCircle className="size-3.5 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300">{engineNotice}</p>
        </div>
      )}

      {/* Translation quality indicator */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-slate-600">Quality:</span>
        <span className="text-[10px] font-medium text-emerald-600">
          GTX primary · Groq fallback
        </span>
      </div>

      {/* AI Voice selector */}
      <VoiceSelector
        tts={tts}
        targetLang={store.targetLang}
        selectedVoiceURI={selectedVoiceURI}
        onChange={setSelectedVoiceURI}
      />

      {/* Visualizer */}
      {visualStream && (
        <div className="h-10 flex items-center justify-center">
          <AudioVisualizer
            stream={visualStream}
            isActive={isRecording}
            color="blue"
            bars={24}
            height={32}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertCircle className="size-3.5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* Speaking indicator */}
      {store.isPlaying && !hostMuted && (
        <div className="flex items-center gap-2 px-1">
          <div className="flex-1 flex items-center gap-1.5 text-xs text-emerald-400">
            <Volume2 className="size-3.5 animate-pulse" /> Speaking…
          </div>
          <Button variant="ghost" size="sm" onClick={stopHostTts}>
            <VolumeX className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Record button + host mute toggle */}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="lg"
          onClick={toggleHostMute}
          title={hostMuted ? "Unmute host audio" : "Mute host audio"}
          className={`shrink-0 border transition-colors ${
            hostMuted
              ? "border-slate-600 text-slate-500 hover:border-slate-500 hover:text-slate-400"
              : "border-blue-500/30 text-blue-400 hover:border-blue-500/50 hover:text-blue-300"
          }`}
        >
          {hostMuted ? (
            <VolumeX className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
        </Button>

        <Button
          variant={isRecording ? "danger" : "primary"}
          size="lg"
          onClick={toggle}
          className="flex-1"
        >
          {isRecording ? (
            <>
              <Square className="size-4" /> Stop
            </>
          ) : (
            <>
              <Mic className="size-4" /> Start Live Translation
            </>
          )}
        </Button>
      </div>

      {isRecording && (
        <p className="text-[10px] text-center text-slate-600">
          {hostMuted
            ? "Translating — host audio muted"
            : "Speaking — translating live as you talk"}
        </p>
      )}
    </GlassCard>
  );
}

// ── Voice selector sub-component ─────────────────────────────────────────────

function VoiceSelector({
  tts,
  targetLang,
  selectedVoiceURI,
  onChange,
}: {
  tts: ReturnType<typeof useSpeechSynthesis>;
  targetLang: string;
  selectedVoiceURI: string;
  onChange: (uri: string) => void;
}) {
  const tgtInfo = LANGUAGES.find((l) => l.code === targetLang);
  const bcp47 = tgtInfo?.bcp47 ?? "en-US";
  const langVoices = tts.voicesForLang(bcp47);
  const otherVoices = tts.voices.filter((v) => !langVoices.includes(v));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
          AI Voice
        </label>
        {langVoices.length > 0 && (
          <span className="text-[10px] text-slate-700">
            {langVoices.length} voice{langVoices.length !== 1 ? "s" : ""} for{" "}
            {tgtInfo?.name}
          </span>
        )}
      </div>

      {tts.voices.length === 0 ? (
        <p className="text-[11px] text-slate-600 py-1">
          Loading system voices…
        </p>
      ) : (
        <div className="relative">
          <select
            value={selectedVoiceURI}
            onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none bg-white/5 border border-white/10 text-slate-300
              text-xs rounded-lg px-3 py-2 pr-7 outline-none cursor-pointer
              focus:border-blue-500/40 transition-colors"
          >
            <option value="" className="bg-[#111114]">
              Auto — best match for {tgtInfo?.name ?? "target language"}
            </option>
            {langVoices.length > 0 && (
              <optgroup label={`── ${tgtInfo?.name ?? "Target"} voices`}>
                {langVoices.map((v) => (
                  <option
                    key={v.voiceURI}
                    value={v.voiceURI}
                    className="bg-[#111114]"
                  >
                    {v.name}
                    {v.localService ? " · Local" : " · Online"}
                  </option>
                ))}
              </optgroup>
            )}
            {otherVoices.length > 0 && (
              <optgroup label="── Other voices">
                {otherVoices.map((v) => (
                  <option
                    key={v.voiceURI}
                    value={v.voiceURI}
                    className="bg-[#111114]"
                  >
                    {v.name} ({v.lang})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs">
            ▾
          </span>
        </div>
      )}
    </div>
  );
}
