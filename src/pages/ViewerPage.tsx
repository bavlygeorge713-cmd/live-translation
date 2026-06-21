import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Wifi, WifiOff, Globe, Volume2, VolumeX } from "lucide-react";
import { useBroadcast, type BroadcastMessage } from "@/hooks/useBroadcast";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { LANGUAGES } from "@/types";
import { roomIdToDisplayName } from "@/lib/roomUtils";
import {
  createWordPacer,
  type PacedWord,
  type WordPacer,
} from "@/lib/wordPacer";

const VIEWER_LANG_KEY = "ct_viewer_lang";
const VIEWER_LANG_MANUAL_KEY = "ct_viewer_lang_manual";


interface ViewerPageProps {
  roomId?: string;
}

export function ViewerPage({ roomId }: ViewerPageProps) {
  const roomName = roomId ? roomIdToDisplayName(roomId) : undefined;

  const handleMessageRef = useRef<((msg: BroadcastMessage) => void) | null>(
    null,
  );
  const stableOnMessage = useCallback((msg: BroadcastMessage) => {
    handleMessageRef.current?.(msg);
  }, []);

  // ── Language (declared before useBroadcast so viewerLang can be passed) ────
  const [viewerLang, setViewerLangState] = useState<string>(
    () => localStorage.getItem(VIEWER_LANG_KEY) ?? "host",
  );
  const viewerLangRef = useRef(viewerLang);

  const { connected } = useBroadcast(
    "viewer",
    stableOnMessage,
    roomId,
    viewerLang === "host" ? null : viewerLang,
  );
  const tts = useSpeechSynthesis();

  // ── Language (continued) ───────────────────────────────────────────────────
  const hasManuallySelectedRef = useRef(
    localStorage.getItem(VIEWER_LANG_MANUAL_KEY) === "true",
  );
  const [hostTargetLang, setHostTargetLang] = useState("");
  const hostTargetLangRef = useRef("");

  // ── Display ────────────────────────────────────────────────────────────────
  const [confirmedLines, setConfirmedLines] = useState<string[]>([]);
  const confirmedLinesRef = useRef<string[]>([]);
  const [liveLine, setLiveLine] = useState("");

  // ── Evolving chunk tracking (the line the pacer is currently typing) ──────
  const evolvingSeqRef = useRef(-1);
  const evolvingTextRef = useRef("");

  // ── Chunk dedupe — keyed by batchId:seqId (seqIds reset per host session);
  //    covers history seeds and SSE redelivery after reconnect ───────────────
  const processedKeysRef = useRef<Set<string>>(new Set());

  // ── Word pacer — the only path live text takes to the screen ──────────────
  const pacerRef = useRef<WordPacer | null>(null);

  // ── Audio ──────────────────────────────────────────────────────────────────
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioUnlockedRef = useRef(false);
  audioUnlockedRef.current = audioUnlocked;
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const ttsEnabledRef = useRef(true);
  ttsEnabledRef.current = ttsEnabled;
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const selectedVoiceURIRef = useRef("");
  selectedVoiceURIRef.current = selectedVoiceURI;

  // ── Spotify lyrics effect: track which line TTS is currently reading ───────
  const [currentlyReadingIndex, setCurrentlyReadingIndex] = useState(-1);
  const currentlyReadingIndexRef = useRef(-1);

  // ── TTS queue with index tracking ─────────────────────────────────────────
  const lastSpokenIndexRef = useRef(-1);
  const ttsQueueRef = useRef<Array<{ text: string; index: number; lang: string }>>([]);
  const ttsBusyRef = useRef(false);
  const drainTtsRef = useRef<() => void>(() => {});

  // Parallel to confirmedLines — bcp47 of each line's language at the time it was confirmed
  const confirmedLineLangsRef = useRef<string[]>([]);

  // ── Effective language ─────────────────────────────────────────────────────
  const effectiveLang =
    viewerLang === "host" ? hostTargetLang || "en" : viewerLang;
  const viewerBcp47 =
    LANGUAGES.find((l) => l.code === effectiveLang)?.bcp47 ?? "en-US";
  const targetLangBcp47Ref = useRef(viewerBcp47);
  targetLangBcp47Ref.current = viewerBcp47;

  drainTtsRef.current = () => {
    if (ttsBusyRef.current || ttsQueueRef.current.length === 0) return;

    const { text, index, lang } = ttsQueueRef.current.shift()!;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 1.25;

    const voices = window.speechSynthesis.getVoices();
    const uri = selectedVoiceURIRef.current;
    if (uri) {
      const voice = voices.find((v) => v.voiceURI === uri);
      if (voice) utter.voice = voice;
    } else {
      const langPrefix = lang.split("-")[0];
      // Prefer high-quality voice that matches the item's language
      const preferred =
        voices.find((v) => v.lang.startsWith(langPrefix) && v.name.includes("Google")) ||
        voices.find((v) => v.lang.startsWith(langPrefix) && v.name.includes("Microsoft")) ||
        voices.find((v) => v.lang.startsWith(langPrefix) && v.name.includes("Natural")) ||
        voices.find((v) => v.lang.startsWith(langPrefix));
      if (preferred) utter.voice = preferred;
      // No matching voice: leave utter.voice unset; utter.lang still tells the OS the right language
    }

    ttsBusyRef.current = true;
    currentlyReadingIndexRef.current = index;
    setCurrentlyReadingIndex(index);

    const clearReading = () => {
      currentlyReadingIndexRef.current = -1;
      setCurrentlyReadingIndex(-1);
      ttsBusyRef.current = false;
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
      drainTtsRef.current();
    };

    const safetyTimer = setTimeout(() => {
      if (ttsBusyRef.current) clearReading();
    }, 30_000);

    utter.onstart = () => {
      currentlyReadingIndexRef.current = index;
      setCurrentlyReadingIndex(index);
    };
    utter.onend = () => {
      clearTimeout(safetyTimer);
      clearReading();
    };
    utter.onerror = () => {
      clearTimeout(safetyTimer);
      clearReading();
    };
    utter.onpause = () => {
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    };

    try {
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utter);
    } catch {
      clearTimeout(safetyTimer);
      ttsBusyRef.current = false;
      currentlyReadingIndexRef.current = -1;
      setCurrentlyReadingIndex(-1);
      drainTtsRef.current();
    }
  };

  // Queue newly frozen confirmed lines for TTS (fires only on length change)
  useEffect(() => {
    const n = confirmedLines.length;
    if (n === 0) return;
    if (!ttsEnabledRef.current || !audioUnlockedRef.current) return;

    for (let i = lastSpokenIndexRef.current + 1; i < n; i++) {
      const line = confirmedLines[i].trim();
      const lang = confirmedLineLangsRef.current[i] ?? targetLangBcp47Ref.current;
      if (line) ttsQueueRef.current.push({ text: line, index: i, lang });
    }
    lastSpokenIndexRef.current = n - 1;
    drainTtsRef.current();
  }, [confirmedLines.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      pacerRef.current?.clear();
    },
    [],
  );

  // ── Tap-to-unlock audio ────────────────────────────────────────────────────
  const handleUnlockAudio = () => {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    try {
      window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
    try {
      const silent = new SpeechSynthesisUtterance(" ");
      silent.volume = 0;
      silent.onerror = () => {};
      window.speechSynthesis.speak(silent);
    } catch {
      /* ignore */
    }

    ttsBusyRef.current = false;
    ttsQueueRef.current = [];
    lastSpokenIndexRef.current = -1;
    setAudioUnlocked(true);
    setTimeout(() => drainTtsRef.current(), 150);
  };

  // ── Add confirmed line — exact-match dedupe against only the LAST 3 lines ─
  const addConfirmedLine = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 3) return;
    // Capture lang at call time (not inside setter, to avoid stale-closure surprises)
    const lang = targetLangBcp47Ref.current;
    setConfirmedLines((prev) => {
      if (prev.slice(-3).includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      confirmedLinesRef.current = next;
      confirmedLineLangsRef.current.push(lang);
      return next;
    });
  }, []);

  // Add a history line — no TTS (advance lastSpokenIndex past it)
  const addHistoryLine = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 3) return;
    const lang = targetLangBcp47Ref.current;
    setConfirmedLines((prev) => {
      if (prev.slice(-3).includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      confirmedLinesRef.current = next;
      confirmedLineLangsRef.current.push(lang);
      lastSpokenIndexRef.current = next.length - 1;
      return next;
    });
  }, []);

  // ── Freeze evolving liveLine → confirmedLines ─────────────────────────────
  const freezeEvolvingLine = useCallback(() => {
    const finalText = evolvingTextRef.current.trim();
    evolvingTextRef.current = "";
    evolvingSeqRef.current = -1;
    setLiveLine("");
    if (finalText.length >= 3) addConfirmedLine(finalText);
  }, [addConfirmedLine]);

  // ── Word pacer drain — appends one word at a time to the live line; the
  //    chunk's last word freezes the line into confirmedLines ────────────────
  const onPacedWordRef = useRef<(item: PacedWord) => void>(() => {});
  onPacedWordRef.current = (item) => {
    if (evolvingSeqRef.current !== item.seqId) {
      if (evolvingSeqRef.current >= 0) freezeEvolvingLine(); // safety net
      evolvingSeqRef.current = item.seqId;
      evolvingTextRef.current = "";
    }
    evolvingTextRef.current = evolvingTextRef.current
      ? evolvingTextRef.current + " " + item.word
      : item.word;
    setLiveLine(evolvingTextRef.current);
    if (item.isLast) freezeEvolvingLine();
  };

  const getPacer = useCallback(() => {
    if (!pacerRef.current) {
      pacerRef.current = createWordPacer((item) =>
        onPacedWordRef.current(item),
      );
    }
    return pacerRef.current;
  }, []);

  // ── Tracking ───────────────────────────────────────────────────────────────
  const sessionStartTimeRef = useRef(Date.now());

  // ── Misc ───────────────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const viewerLangInfo = LANGUAGES.find((l) => l.code === effectiveLang);
  const availableVoices = tts.voicesForLang(viewerBcp47);
  const isRtl = new Set(["ar", "he", "fa", "ur"]).has(effectiveLang);

  // ── Language change ────────────────────────────────────────────────────────
  const setViewerLang = useCallback((newLang: string, isManual: boolean) => {
    viewerLangRef.current = newLang;
    const bcp47Lang =
      newLang === "host" ? hostTargetLangRef.current || "en" : newLang;
    targetLangBcp47Ref.current =
      LANGUAGES.find((l) => l.code === bcp47Lang)?.bcp47 ?? "en-US";
    setViewerLangState(newLang);

    if (isManual) {
      localStorage.setItem(VIEWER_LANG_KEY, newLang);
      localStorage.setItem(VIEWER_LANG_MANUAL_KEY, "true");
      hasManuallySelectedRef.current = true;
      setSelectedVoiceURI("");
    }

    pacerRef.current?.clear();

    window.speechSynthesis.cancel();
    ttsQueueRef.current = [];
    ttsBusyRef.current = false;
    lastSpokenIndexRef.current = -1;
    currentlyReadingIndexRef.current = -1;
    setCurrentlyReadingIndex(-1);

    evolvingSeqRef.current = -1;
    evolvingTextRef.current = "";
    confirmedLinesRef.current = [];
    confirmedLineLangsRef.current = [];
    setConfirmedLines([]);
    setLiveLine("");
  }, []);

  // ── Message handler ────────────────────────────────────────────────────────
  const handleMessage = useCallback(
    (msg: BroadcastMessage) => {
      if (msg.type !== "translation") return;
      if (
        !msg.isHistory &&
        msg.ts !== undefined &&
        msg.ts < sessionStartTimeRef.current
      )
        return;
      if (msg.refined) return; // legacy refinement broadcasts — the first text is canonical now

      // Per-lang channel messages carry targetLang=viewerLang, not the host broadcast lang
      if (!msg.fromPerLangChannel) {
        const incomingHostLang = msg.targetLang ?? "";
        if (incomingHostLang && incomingHostLang !== hostTargetLangRef.current) {
          hostTargetLangRef.current = incomingHostLang;
          setHostTargetLang(incomingHostLang);
          if (!hasManuallySelectedRef.current) {
            viewerLangRef.current = "host";
            const bcp47 =
              LANGUAGES.find((l) => l.code === incomingHostLang)?.bcp47 ??
              "en-US";
            targetLangBcp47Ref.current = bcp47;
            try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
            ttsBusyRef.current = false;
            currentlyReadingIndexRef.current = -1;
            setCurrentlyReadingIndex(-1);
            setSelectedVoiceURI("");
            setTimeout(() => drainTtsRef.current(), 0);
          }
        }
      }

      const lang = viewerLangRef.current;
      const isFollowHost = lang === "host" || lang === (msg.targetLang ?? "");

      // Dedupe key — seqIds reset every host session, so scope them by batchId
      const seqKey =
        msg.seqId !== undefined ? `${msg.batchId ?? ""}:${msg.seqId}` : null;

      // History messages: display immediately, no TTS, no pacing
      if (msg.isHistory) {
        if (seqKey) {
          if (processedKeysRef.current.has(seqKey)) return;
          processedKeysRef.current.add(seqKey);
        }
        if (isFollowHost) {
          const chunk = (msg.chunk ?? "").trim();
          if (chunk.length >= 3) addHistoryLine(chunk);
        }
        return;
      }

      if (!msg.isFinal) return;

      if (isFollowHost) {
        const chunk = (msg.chunk ?? "").trim();
        if (!chunk || chunk.length < 3) return;

        // No seqId: old protocol — direct confirmed line
        if (msg.seqId === undefined) {
          addConfirmedLine(chunk);
          return;
        }

        if (processedKeysRef.current.has(seqKey!)) return;
        processedKeysRef.current.add(seqKey!);

        // Split the chunk into words and pace them onto the live line
        getPacer().enqueue(msg.seqId, chunk);
      }
    },
    [addConfirmedLine, addHistoryLine, getPacer],
  );

  handleMessageRef.current = handleMessage;

  useEffect(() => {
    setSelectedVoiceURI("");
  }, [viewerLang]);

  const handleMuteToggle = () => {
    if (ttsEnabled) {
      window.speechSynthesis.cancel();
      ttsQueueRef.current = [];
      ttsBusyRef.current = false;
      currentlyReadingIndexRef.current = -1;
      setCurrentlyReadingIndex(-1);
      setTtsEnabled(false);
    } else {
      lastSpokenIndexRef.current = confirmedLinesRef.current.length - 1;
      setTtsEnabled(true);
    }
  };

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [confirmedLines, liveLine]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        window.speechSynthesis.cancel();
        ttsQueueRef.current = [];
        ttsBusyRef.current = false;
        currentlyReadingIndexRef.current = -1;
        setCurrentlyReadingIndex(-1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ── Font size based on total text length ──────────────────────────────────
  const totalLen = confirmedLines.join(" ").length + liveLine.length;
  const fontSize =
    totalLen === 0
      ? 52
      : totalLen < 120
        ? 52
        : totalLen < 300
          ? 44
          : totalLen < 600
            ? 36
            : totalLen < 1000
              ? 30
              : totalLen < 1600
                ? 24
                : 20;

  return (
    <div className="h-screen bg-[#08080f] flex flex-col text-white overflow-hidden">
      {/* ── Tap-to-start overlay ── */}
      {!audioUnlocked && (
        <div
          onClick={handleUnlockAudio}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer bg-[#08080f] select-none"
        >
          <motion.div
            animate={{ scale: [1, 1.22, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="mb-8 rounded-full bg-blue-500/10 border-2 border-blue-500/40 p-10"
          >
            <Volume2 className="size-24 text-blue-400" />
          </motion.div>
          <p className="text-white text-3xl font-bold px-6 text-center">
            Tap to Enable Audio
          </p>
          <p className="text-slate-400 text-base mt-3 px-8 text-center">
            Tap anywhere to start live translation
          </p>
          <p className="text-slate-600 text-sm mt-4">
            Required by browser for audio playback
          </p>
        </div>
      )}

      {/* ── Header ── */}
      <div className="shrink-0 z-40 bg-[#08080f]/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-5 pt-3 pb-2 gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="size-6 shrink-0 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20
              flex items-center justify-center border border-white/10"
            >
              <Globe className="size-3 text-blue-400" />
            </div>
            <span className="text-sm font-semibold text-slate-200 truncate">
              {roomName ?? "Conference Translator"}
            </span>
            <span className="text-[11px] text-slate-600 shrink-0">
              · Live View
            </span>
          </div>
          <div
            className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
              connected
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-slate-500/10 border-slate-500/20 text-slate-500"
            }`}
          >
            {connected ? (
              <>
                <Wifi className="size-3" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="size-3" />
                <span>Connecting…</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pb-2.5 gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-slate-500 shrink-0">
              My language:
            </span>
            <div className="relative">
              <select
                value={viewerLang}
                onChange={(e) => setViewerLang(e.target.value, true)}
                className="appearance-none bg-white/5 border border-white/10 text-slate-300
                  text-[11px] rounded-full px-3 py-1.5 pr-6 outline-none cursor-pointer
                  focus:border-blue-500/40 transition-colors max-w-[170px]"
              >
                <option value="host" className="bg-[#0d0d14]">
                  🌐 Follow Host
                </option>
                {LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
                  <option key={l.code} value={l.code} className="bg-[#0d0d14]">
                    {l.flag} {l.name}
                  </option>
                ))}
              </select>
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none text-[10px]">
                ▾
              </span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              onClick={handleMuteToggle}
              title={ttsEnabled ? "Mute audio" : "Enable audio"}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                ttsEnabled
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20"
                  : "bg-slate-500/10 border-slate-500/20 text-slate-500 hover:border-slate-400/30"
              }`}
            >
              {ttsEnabled ? (
                <Volume2 className="size-3.5" />
              ) : (
                <VolumeX className="size-3.5" />
              )}
              <span>{ttsEnabled ? "Audio on" : "Audio off"}</span>
            </button>

            {ttsEnabled && availableVoices.length > 0 && (
              <div className="relative">
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="appearance-none bg-white/5 border border-white/10 text-slate-400
                    text-[11px] rounded-full px-3 py-1.5 pr-6 outline-none cursor-pointer
                    focus:border-blue-500/40 transition-colors w-[130px]"
                >
                  <option value="" className="bg-[#0d0d14]">
                    Auto voice
                  </option>
                  {availableVoices.map((v) => (
                    <option
                      key={v.voiceURI}
                      value={v.voiceURI}
                      className="bg-[#0d0d14]"
                    >
                      {v.name}
                    </option>
                  ))}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none text-[10px]">
                  ▾
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="h-[3px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
      </div>

      {/* ── Scrollable translation area ── */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-8 py-8">
        {confirmedLines.length === 0 && !liveLine ? (
          <div className="h-full flex flex-col items-center justify-center gap-5 text-center">
            <div className="flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="size-2.5 rounded-full bg-blue-500/40"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    delay: i * 0.25,
                  }}
                />
              ))}
            </div>
            <p className="text-slate-500 text-lg font-light">
              {connected
                ? "Waiting for the presenter to speak…"
                : "Connecting to presenter…"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {viewerLangInfo && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-2xl">{viewerLangInfo.flag}</span>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium">
                  {viewerLangInfo.name}
                </span>
              </div>
            )}

            {/* Confirmed (frozen) lines — Spotify lyrics effect */}
            {confirmedLines.map((line, i) => {
              const isActive = i === currentlyReadingIndex;
              const isFuture =
                currentlyReadingIndex >= 0 && i > currentlyReadingIndex;
              return (
                <p
                  key={i}
                  dir={isRtl ? "rtl" : "ltr"}
                  className="font-semibold leading-relaxed"
                  style={{
                    fontSize: `${isActive ? fontSize + 2 : fontSize}px`,
                    lineHeight: 1.45,
                    color: isFuture ? "#475569" : "#ffffff",
                    transition: "color 0.3s ease, font-size 0.2s ease",
                  }}
                >
                  {line}
                </p>
              );
            })}

            {/* Live evolving line — the word pacer types here, then freezes into confirmedLines */}
            {liveLine && (
              <p
                dir={isRtl ? "rtl" : "ltr"}
                className="font-semibold leading-relaxed"
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: 1.45,
                  color: "#ffffff",
                }}
              >
                {liveLine}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom accent ── */}
      <div className="shrink-0 h-[2px] bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
      <div className="shrink-0 py-2 text-center">
        <p className="text-[10px] text-slate-700">
          Conference Translator · Live Translation View
        </p>
      </div>
    </div>
  );
}
