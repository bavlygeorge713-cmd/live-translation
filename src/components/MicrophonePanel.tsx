import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, AlertCircle, Volume2, VolumeX, RefreshCw } from "lucide-react";
import { useAudioDevices } from "@/hooks/useMicrophone";
import { useWebSpeechSTT } from "@/hooks/useWebSpeechSTT";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useStore } from "@/store/translationStore";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { LANGUAGES } from "@/types";

interface Props {
  onStream: (s: MediaStream | null) => void;
  translate: (text: string, src: string, tgt: string) => Promise<string>;
}

export function MicrophonePanel({ onStream, translate }: Props) {
  const store = useStore();
  const { devices, refresh: refreshDevices } = useAudioDevices();
  const webSpeech = useWebSpeechSTT();
  const tts = useSpeechSynthesis();

  // ── Session accumulation ─────────────────────────────────────────────────────
  const sessionTranscriptRef = useRef("");   // finalized transcript only
  const sessionTranslationRef = useRef("");  // finalized translation only

  // ── Translation queue for final results ──────────────────────────────────────
  const translationQueueRef = useRef<string[]>([]);
  const queueRunningRef = useRef(false);

  // ── Live interim translation ──────────────────────────────────────────────────
  const interimDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interimTranslatingRef = useRef(false);
  const lastInterimRef = useRef(""); // the last interim text we debounced on
  const lastInterimTranslateTimeRef = useRef(0); // throttle: ms of last interim translate

  // ── Recording guard ──────────────────────────────────────────────────────────
  const isRecordingRef = useRef(false);

  // ── Stable refs so callbacks never go stale ──────────────────────────────────
  const latestRef = useRef({
    sourceLang: store.sourceLang,
    targetLang: store.targetLang,
    speechRate: store.speechRate,
  });
  latestRef.current = {
    sourceLang: store.sourceLang,
    targetLang: store.targetLang,
    speechRate: store.speechRate,
  };
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const storeRef = useRef(store);
  storeRef.current = store;

  // ── Voice selector ───────────────────────────────────────────────────────────
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const selectedVoiceURIRef = useRef("");
  selectedVoiceURIRef.current = selectedVoiceURI;

  // Reset voice selection when target language changes
  useEffect(() => { setSelectedVoiceURI(""); }, [store.targetLang]);

  // ── Component state ──────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [visualStream, setVisualStream] = useState<MediaStream | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [error, setError] = useState<string | null>(null);

  // ── Helper: get effective source lang ───────────────────────────────────────
  const getEffectiveSrc = () => {
    const { sourceLang } = latestRef.current;
    return !sourceLang || sourceLang === "auto" ? "en" : sourceLang;
  };

  // ── Live interim translation (debounced 500ms) ────────────────────────────────
  // Translates partial speech so the canvas updates in near-real-time.
  const doInterimTranslate = useCallback(async (interimPhrase: string): Promise<void> => {
    if (!isRecordingRef.current || interimTranslatingRef.current) return;
    const { targetLang } = latestRef.current;
    const effectiveSrc = getEffectiveSrc();
    if (effectiveSrc === targetLang) return; // same language — transcript IS the translation

    interimTranslatingRef.current = true;
    try {
      const translated = await translateRef.current(interimPhrase, effectiveSrc, targetLang);
      if (!isRecordingRef.current) return;
      const t = translated.trim();
      if (!t) return;
      storeRef.current.setInterimChunk(t); // lets viewer speak first words immediately
      // Show: finalized session translation + live interim preview
      const combined = sessionTranslationRef.current
        ? sessionTranslationRef.current + " " + t
        : t;
      storeRef.current.setTranslatedText(combined);
    } catch { /* ignore interim errors silently */ } finally {
      interimTranslatingRef.current = false;
    }
  }, []);

  // ── Final phrase translation (authoritative, queued) ─────────────────────────
  const doTranslateSingle = useCallback(async (phrase: string): Promise<void> => {
    if (!isRecordingRef.current) return;
    const s = storeRef.current;
    const { targetLang, speechRate } = latestRef.current;
    const effectiveSrc = getEffectiveSrc();

    if (effectiveSrc === targetLang) {
      sessionTranslationRef.current = sessionTranscriptRef.current;
      s.setTranslatedText(sessionTranslationRef.current);
      return;
    }

    try {
      s.setProcessingState("translating");
      const translated = await translateRef.current(phrase, effectiveSrc, targetLang);
      if (!isRecordingRef.current) return;

      const t = translated.trim();
      if (!t) return;

      sessionTranslationRef.current = sessionTranslationRef.current
        ? sessionTranslationRef.current + " " + t
        : t;
      s.setLatestChunk(t);
      s.setTranslatedText(sessionTranslationRef.current);

      s.addHistory({
        id: crypto.randomUUID(),
        originalText: phrase,
        translatedText: t,
        sourceLang: effectiveSrc,
        targetLang,
        timestamp: new Date(),
      });

      const tgtInfo = LANGUAGES.find((l) => l.code === targetLang);
      s.setProcessingState("speaking");
      ttsRef.current.speak(t, tgtInfo?.bcp47 ?? "en-US", speechRate, selectedVoiceURIRef.current || undefined);
      s.setIsPlaying(true);
      s.setProcessingState("transcribing");
    } catch (err) {
      if (!isRecordingRef.current) return;
      const msg = (err as Error).message;
      s.setError(msg);
      setError(msg);
      s.setProcessingState("error");
    }
  }, []);

  // ── Drain final-translation queue sequentially ────────────────────────────────
  const drainQueue = useCallback(async () => {
    if (queueRunningRef.current) return;
    queueRunningRef.current = true;
    while (translationQueueRef.current.length > 0) {
      const phrase = translationQueueRef.current.shift()!;
      await doTranslateSingle(phrase);
    }
    queueRunningRef.current = false;
    if (isRecordingRef.current) storeRef.current.setProcessingState("transcribing");
  }, [doTranslateSingle]);

  const enqueueTranslation = useCallback((phrase: string) => {
    translationQueueRef.current.push(phrase);
    drainQueue();
  }, [drainQueue]);

  // ── Web Speech callbacks ──────────────────────────────────────────────────────

  const handleInterim = useCallback((interimText: string) => {
    if (!isRecordingRef.current) return;

    // Show combined (finalized + live interim) in transcript immediately
    const display = sessionTranscriptRef.current
      ? sessionTranscriptRef.current + " " + interimText
      : interimText;
    storeRef.current.setTranscribedText(display);
    storeRef.current.setProcessingState("transcribing");

    // Hybrid throttle+debounce: translate immediately if 600ms has passed since
    // the last interim translation (so it fires during continuous speech too),
    // otherwise schedule 200ms after the last word arrives.
    lastInterimRef.current = interimText;
    if (interimDebounceRef.current) clearTimeout(interimDebounceRef.current);
    const now = Date.now();
    if (now - lastInterimTranslateTimeRef.current >= 600) {
      lastInterimTranslateTimeRef.current = now;
      doInterimTranslate(interimText);
    } else {
      interimDebounceRef.current = setTimeout(() => {
        if (isRecordingRef.current && lastInterimRef.current === interimText) {
          lastInterimTranslateTimeRef.current = Date.now();
          doInterimTranslate(interimText);
        }
      }, 200);
    }
  }, [doInterimTranslate]);

  const handleFinal = useCallback((finalText: string) => {
    if (!isRecordingRef.current) return;

    // Cancel any pending interim translation — final result takes over
    if (interimDebounceRef.current) {
      clearTimeout(interimDebounceRef.current);
      interimDebounceRef.current = null;
    }
    lastInterimRef.current = "";

    const trimmed = finalText.trim();
    if (!trimmed) return;

    sessionTranscriptRef.current = sessionTranscriptRef.current
      ? sessionTranscriptRef.current + " " + trimmed
      : trimmed;
    storeRef.current.setTranscribedText(sessionTranscriptRef.current);

    // Queue the final phrase for authoritative translation
    enqueueTranslation(trimmed);
  }, [enqueueTranslation]);

  // ── Toggle recording ─────────────────────────────────────────────────────────
  const toggle = async () => {
    setError(null);

    if (isRecording) {
      isRecordingRef.current = false;
      if (interimDebounceRef.current) clearTimeout(interimDebounceRef.current);
      translationQueueRef.current = [];
      webSpeech.stop();
      ttsRef.current.stop();
      visualStream?.getTracks().forEach((t) => t.stop());
      setVisualStream(null);
      setIsRecording(false);
      onStream(null);
      storeRef.current.setInterimChunk("");
      storeRef.current.setProcessingState("idle");
    } else {
      storeRef.current.setError(null);
      sessionTranscriptRef.current = "";
      sessionTranslationRef.current = "";
      translationQueueRef.current = [];
      queueRunningRef.current = false;
      lastInterimRef.current = "";
      lastInterimTranslateTimeRef.current = 0;
      interimTranslatingRef.current = false;
      storeRef.current.setTranscribedText("");
      storeRef.current.setTranslatedText("");
      storeRef.current.setLatestChunk("");
      storeRef.current.setInterimChunk("");

      if (!webSpeech.isSupported) {
        setError("Live speech requires Chrome or Edge.");
        return;
      }

      const srcInfo = LANGUAGES.find((l) => l.code === latestRef.current.sourceLang);
      const langCode = srcInfo?.bcp47 || "en-US";
      const started = webSpeech.start(handleInterim, handleFinal, langCode, (errCode) => {
        if (!isRecordingRef.current) return;
        const msg =
          errCode === "not-allowed" ? "Microphone permission denied. Allow mic access and try again." :
          errCode === "network" ? "Speech recognition network error. Check your internet connection." :
          errCode === "audio-capture" ? "Microphone not found or in use by another app." :
          `Speech recognition error: ${errCode}`;
        setError(msg);
        storeRef.current.setError(msg);
      });

      if (!started) {
        setError("Microphone access denied. Check browser permissions.");
        return;
      }

      // Set recording flag BEFORE getUserMedia so speech callbacks don't get
      // silently dropped during the async mic-permission prompt.
      isRecordingRef.current = true;
      setIsRecording(true);

      try {
        const vs = await navigator.mediaDevices.getUserMedia({
          audio: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : { echoCancellation: true, noiseSuppression: true },
        });
        setVisualStream(vs);
        onStream(vs);
      } catch {
        onStream(null);
      }
    }
  };

  return (
    <GlassCard glow="blue" className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Microphone</h2>
          <p className="text-xs text-slate-500 mt-0.5">Live · Web Speech API</p>
        </div>
        <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
          <Mic className="size-4 text-blue-400" />
        </div>
      </div>

      {/* Device selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">Audio Input</label>
          <button onClick={refreshDevices} className="text-slate-600 hover:text-slate-400 transition-colors">
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
            <option value="" className="bg-[#111114]">Default microphone</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId} className="bg-[#111114]">
                {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs">▾</span>
        </div>
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
          <AudioVisualizer stream={visualStream} isActive={isRecording} color="blue" bars={24} height={32} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <AlertCircle className="size-3.5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {/* TTS controls */}
      {store.isPlaying && (
        <div className="flex items-center gap-2 px-1">
          <div className="flex-1 flex items-center gap-1.5 text-xs text-emerald-400">
            <Volume2 className="size-3.5 animate-pulse" /> Speaking…
          </div>
          <Button variant="ghost" size="sm" onClick={() => { tts.stop(); store.setIsPlaying(false); }}>
            <VolumeX className="size-3.5" />
          </Button>
        </div>
      )}

      <Button
        variant={isRecording ? "danger" : "primary"}
        size="lg"
        onClick={toggle}
        className="w-full"
      >
        {isRecording
          ? <><Square className="size-4" /> Stop Live Translation</>
          : <><Mic className="size-4" /> Start Live Translation</>
        }
      </Button>

      {isRecording && (
        <p className="text-[10px] text-center text-slate-600">
          Speaking — translating live as you talk
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
            {langVoices.length} voice{langVoices.length !== 1 ? "s" : ""} for {tgtInfo?.name}
          </span>
        )}
      </div>

      {tts.voices.length === 0 ? (
        <p className="text-[11px] text-slate-600 py-1">Loading system voices…</p>
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
                  <option key={v.voiceURI} value={v.voiceURI} className="bg-[#111114]">
                    {v.name}{v.localService ? " · Local" : " · Online"}
                  </option>
                ))}
              </optgroup>
            )}
            {otherVoices.length > 0 && (
              <optgroup label="── Other voices">
                {otherVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI} className="bg-[#111114]">
                    {v.name} ({v.lang})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs">▾</span>
        </div>
      )}
    </div>
  );
}
