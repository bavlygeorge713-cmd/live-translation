import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  Headphones,
  Languages,
  Moon,
  Radio,
  Search,
  Sun,
  Volume2,
  X,
} from "lucide-react";
import { cx, LogoMark, RButton } from "@/components/ui/redesign";
import { useBroadcast, type BroadcastMessage } from "@/hooks/useBroadcast";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { LANGUAGES, type Language } from "@/types";
import { roomIdToDisplayName } from "@/lib/roomUtils";
import {
  createWordPacer,
  type PacedWord,
  type WordPacer,
} from "@/lib/wordPacer";

const VIEWER_LANG_KEY = "ct_viewer_lang";
const VIEWER_LANG_MANUAL_KEY = "ct_viewer_lang_manual";
const VIEWER_THEME_KEY = "ct_viewer_theme";

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

  // ── Allow-list (received from host via config message) ────────────────────
  const [allowedLangs, setAllowedLangs] = useState<string[]>([]);
  const [hasReceivedConfig, setHasReceivedConfig] = useState(false);
  const [langRemovedNotice, setLangRemovedNotice] = useState(false);

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
  const ttsQueueRef = useRef<
    Array<{ text: string; index: number; lang: string }>
  >([]);
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
        voices.find(
          (v) => v.lang.startsWith(langPrefix) && v.name.includes("Google"),
        ) ||
        voices.find(
          (v) => v.lang.startsWith(langPrefix) && v.name.includes("Microsoft"),
        ) ||
        voices.find(
          (v) => v.lang.startsWith(langPrefix) && v.name.includes("Natural"),
        ) ||
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
      const lang =
        confirmedLineLangsRef.current[i] ?? targetLangBcp47Ref.current;
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
  // "Return to live": true while the viewer has scrolled up to re-read
  const [scrolledAway, setScrolledAway] = useState(false);
  const scrolledAwayRef = useRef(false);

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
      if (msg.type === "config") {
        const langs = msg.allowedLangs ?? [];
        setAllowedLangs(langs);
        setHasReceivedConfig(true);
        const currentLang = viewerLangRef.current;
        if (
          currentLang !== "host" &&
          (langs.length === 0 || !langs.includes(currentLang))
        ) {
          setViewerLang("host", false);
          setLangRemovedNotice(true);
          setTimeout(() => setLangRemovedNotice(false), 4000);
        }
        return;
      }
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
        if (
          incomingHostLang &&
          incomingHostLang !== hostTargetLangRef.current
        ) {
          hostTargetLangRef.current = incomingHostLang;
          setHostTargetLang(incomingHostLang);
          if (!hasManuallySelectedRef.current) {
            viewerLangRef.current = "host";
            const bcp47 =
              LANGUAGES.find((l) => l.code === incomingHostLang)?.bcp47 ??
              "en-US";
            targetLangBcp47Ref.current = bcp47;
            try {
              window.speechSynthesis.cancel();
            } catch {
              /* ignore */
            }
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
    if (scrollRef.current && !scrolledAwayRef.current)
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

  // ── Presentation-only state (redesign): theme, language sheet ─────────────
  const [dark, setDark] = useState(
    () => localStorage.getItem(VIEWER_THEME_KEY) === "dark",
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem(VIEWER_THEME_KEY, next ? "dark" : "light");
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const away = el.scrollHeight - el.scrollTop - el.clientHeight > 120;
    scrolledAwayRef.current = away;
    setScrolledAway(away);
  };
  const returnToLive = () => {
    scrolledAwayRef.current = false;
    setScrolledAway(false);
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  const followHost = viewerLang === "host";
  const selectableLangs =
    hasReceivedConfig && allowedLangs.length > 0
      ? LANGUAGES.filter(
          (l) => l.code !== "auto" && allowedLangs.includes(l.code),
        )
      : [];
  const ownLangInfo = LANGUAGES.find((l) => l.code === viewerLang);
  const langLabel = followHost
    ? "Follow Host"
    : ownLangInfo
      ? `${ownLangInfo.flag} ${ownLangInfo.name}`
      : viewerLang;
  const lastIdx = confirmedLines.length - 1;
  const captionStyle: React.CSSProperties = { unicodeBidi: "plaintext" };

  return (
    <div
      className={cx(
        dark ? "canvas-dark" : "canvas-light",
        "rd-page flex h-[100dvh] flex-col overflow-hidden bg-[var(--canvas-bg)] text-[var(--canvas-text)] transition-colors",
      )}
      style={{ colorScheme: dark ? "dark" : "light" }}
    >
      {/* ── Join screen — its button is the tap-to-unlock gesture for audio ── */}
      {!audioUnlocked && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F4F7FB] px-5 py-8 text-slate-900">
          <div className="mx-auto flex min-h-[calc(100dvh-64px)] max-w-[460px] items-center justify-center">
            <div className="w-full rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,.08)] sm:p-7">
              <div className="mb-7 flex justify-center">
                <LogoMark />
              </div>
              <div className="mb-6 text-center">
                {connected ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200/70">
                    <span className="size-1.5 rounded-full bg-emerald-500" />{" "}
                    Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 ring-1 ring-slate-200">
                    <span className="size-1.5 rounded-full bg-slate-400" />{" "}
                    Connecting…
                  </span>
                )}
                <h1 className="mt-4 text-[24px] font-semibold tracking-[-.035em] text-slate-950">
                  {roomName ?? "Conference Translator"}
                </h1>
                <p className="mt-1.5 text-[12px] text-slate-500">
                  Live Translation
                </p>
              </div>

              <div className="mb-5 rounded-2xl border border-slate-200 p-2">
                <button
                  onClick={() => setViewerLang("host", true)}
                  className={cx(
                    "flex min-h-[62px] w-full items-center gap-3 rounded-xl px-3 text-left transition",
                    followHost
                      ? "bg-brand-50 ring-1 ring-brand-100"
                      : "hover:bg-slate-50",
                  )}
                >
                  <div
                    className={cx(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      followHost
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    <Radio className="size-[18px]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold">Follow Host</div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      Automatically follow the presenter’s language
                    </div>
                  </div>
                  {followHost && (
                    <CircleCheck className="size-[18px] text-brand-600" />
                  )}
                </button>
                <div className="my-1 h-px bg-slate-100" />
                <button
                  onClick={() => setSheetOpen(true)}
                  className={cx(
                    "flex min-h-[62px] w-full items-center gap-3 rounded-xl px-3 text-left transition",
                    !followHost
                      ? "bg-brand-50 ring-1 ring-brand-100"
                      : "hover:bg-slate-50",
                  )}
                >
                  <div
                    className={cx(
                      "grid size-10 shrink-0 place-items-center rounded-xl",
                      !followHost
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    <Languages className="size-[18px]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-semibold">
                      Choose language
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {!followHost
                        ? langLabel
                        : "Select your preferred translation"}
                    </div>
                  </div>
                  <ChevronDown className="size-4 text-slate-400" />
                </button>
              </div>

              <RButton
                variant="primary"
                size="lg"
                className="w-full"
                onClick={handleUnlockAudio}
              >
                Join live translation <ArrowRight className="size-4" />
              </RButton>
              <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-medium text-slate-400">
                <Volume2 className="size-3.5" /> Joining also enables audio
                playback on this device
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="z-20 shrink-0 border-b border-[var(--canvas-border)] bg-[var(--canvas-bg)] px-5 py-3.5">
        <div className="mx-auto max-w-[528px]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[var(--canvas-text)]">
                {roomName ?? "Conference Translator"}
              </div>
              <div className="mt-0.5 truncate text-[10px] text-[var(--canvas-meta)]">
                Live Translation
                {viewerLangInfo &&
                  ` · ${viewerLangInfo.flag} ${viewerLangInfo.name}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {connected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Live
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--canvas-meta)]">
                  <span className="size-1.5 rounded-full bg-slate-400" />{" "}
                  Connecting…
                </span>
              )}
              <button
                onClick={toggleTheme}
                aria-label={dark ? "Use light theme" : "Use dark theme"}
                title={dark ? "Use light theme" : "Use dark theme"}
                className="focus-ring grid size-9 place-items-center rounded-lg text-[var(--canvas-meta)] hover:bg-[var(--canvas-speaking)]"
              >
                {dark ? (
                  <Sun className="size-4" />
                ) : (
                  <Moon className="size-4" />
                )}
              </button>
            </div>
          </div>

          {langRemovedNotice && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-600">
              This language is no longer available. Switched to Follow Host.
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setSheetOpen(true)}
              className="focus-ring flex h-10 min-w-0 flex-1 items-center justify-between rounded-xl border border-[var(--canvas-border)] px-3 text-left"
            >
              <span className="flex min-w-0 items-center gap-2 text-[12px] font-medium">
                <Languages className="size-4 shrink-0 text-[var(--canvas-meta)]" />
                <span className="truncate">
                  {followHost ? "Following host" : langLabel}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-[var(--canvas-meta)]" />
            </button>

            {ttsEnabled && availableVoices.length > 0 && (
              <div className="relative w-[132px] shrink-0">
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  aria-label="Voice"
                  className="focus-ring h-10 w-full appearance-none rounded-xl border border-[var(--canvas-border)] bg-[var(--canvas-bg)] pl-3 pr-8 text-[12px] font-medium text-[var(--canvas-text)] outline-none"
                >
                  <option value="">Auto voice</option>
                  {availableVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--canvas-meta)]" />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Scrollable caption area ── */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="hide-scrollbar h-full overflow-y-auto px-5 pb-10 pt-8"
        >
          <main
            className="caption-font mx-auto max-w-[528px]"
            lang={effectiveLang}
            dir={isRtl ? "rtl" : "ltr"}
          >
            {confirmedLines.length === 0 && !liveLine ? (
              <div
                dir="ltr"
                className="flex min-h-[50vh] flex-col items-center justify-center gap-5 text-center"
              >
                <div className="flex justify-center gap-2">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="size-2.5 rounded-full bg-brand-500/50"
                      animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                      transition={{
                        duration: 1.4,
                        repeat: Infinity,
                        delay: i * 0.25,
                      }}
                    />
                  ))}
                </div>
                <p className="font-sans text-[15px] text-[var(--canvas-meta)]">
                  {connected
                    ? "Waiting for the presenter to speak…"
                    : "Connecting to presenter…"}
                </p>
              </div>
            ) : (
              <div
                className={cx("space-y-8", isRtl && "caption-rtl text-right")}
                style={{
                  fontSize: isRtl ? 29 : 27,
                  lineHeight: isRtl ? 1.65 : 1.52,
                }}
              >
                {/* Confirmed (frozen) lines — older lines fade; the line TTS is
                    reading stays at full strength with a "Speaking now" tag */}
                {confirmedLines.map((line, i) => {
                  const isReading = i === currentlyReadingIndex;
                  const isCurrent = !liveLine && i === lastIdx;
                  const isPrev = liveLine ? i === lastIdx : i === lastIdx - 1;
                  const speakingTag = isReading && (
                    <div className="mt-3 flex items-center gap-2 font-sans text-[10px] font-semibold text-[var(--canvas-edge)]">
                      <Volume2 className="size-3.5" /> Speaking now
                    </div>
                  );
                  if (isCurrent) {
                    return (
                      <div
                        key={i}
                        className="rounded-xl border-s-[3px] border-[var(--canvas-edge)] bg-[var(--canvas-speaking)] px-4 py-3.5 transition-colors duration-150"
                      >
                        <p
                          dir={isRtl ? "rtl" : "ltr"}
                          style={captionStyle}
                          className="font-medium tracking-[-0.015em] text-[var(--canvas-text)]"
                        >
                          {line}
                        </p>
                        {speakingTag}
                      </div>
                    );
                  }
                  return (
                    <div key={i}>
                      <p
                        dir={isRtl ? "rtl" : "ltr"}
                        style={captionStyle}
                        className={cx(
                          "font-medium transition-colors duration-300",
                          isReading
                            ? "text-[var(--canvas-text)]"
                            : isPrev
                              ? "text-[var(--canvas-prev)] opacity-85"
                              : "text-[var(--canvas-old)] opacity-55",
                        )}
                      >
                        {line}
                      </p>
                      {speakingTag}
                    </div>
                  );
                })}

                {/* Live evolving line — the word pacer types here, then freezes into confirmedLines */}
                {liveLine && (
                  <div className="rounded-xl border-s-[3px] border-[var(--canvas-edge)] bg-[var(--canvas-speaking)] px-4 py-3.5 transition-colors duration-150">
                    <p
                      dir={isRtl ? "rtl" : "ltr"}
                      style={captionStyle}
                      className="font-medium tracking-[-0.015em] text-[var(--canvas-text)]"
                    >
                      {liveLine.split(" ").map((word, i) => (
                        <span key={i} className="token-in">
                          <bdi>{word}</bdi>{" "}
                        </span>
                      ))}
                    </p>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {scrolledAway && (
          <button
            onClick={returnToLive}
            className="focus-ring absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-2.5 text-[12px] font-semibold text-white shadow-lg"
          >
            <ArrowDown className="mr-1.5 inline size-3.5" /> Return to live
          </button>
        )}
      </div>

      {/* ── Bottom bar ── */}
      <div className="safe-bottom z-30 shrink-0 border-t border-[var(--canvas-border)] bg-[var(--canvas-bg)] px-4 pt-3">
        <div className="mx-auto flex max-w-[528px] items-center gap-2">
          <button
            onClick={handleMuteToggle}
            title={ttsEnabled ? "Mute audio" : "Enable audio"}
            className={cx(
              "focus-ring flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border text-[13px] font-semibold transition",
              ttsEnabled
                ? "border-brand-300 bg-brand-500/10 text-brand-500"
                : "border-[var(--canvas-border)] text-[var(--canvas-text)]",
            )}
          >
            {ttsEnabled ? (
              <Volume2 className="size-[18px]" />
            ) : (
              <Headphones className="size-[18px]" />
            )}{" "}
            {ttsEnabled ? "Audio on" : "Enable audio"}
          </button>
          <button
            onClick={() => setSheetOpen(true)}
            className="focus-ring flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--canvas-border)] px-3 text-[13px] font-semibold text-[var(--canvas-text)]"
          >
            <Languages className="size-[18px] shrink-0" />
            <span className="truncate">{langLabel}</span>
          </button>
        </div>
      </div>

      {sheetOpen && (
        <LanguageSheet
          followHost={followHost}
          selectedCode={viewerLang}
          options={selectableLangs}
          onChoose={(code) => {
            setViewerLang(code, true);
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

// ── Language bottom sheet (presentational) ───────────────────────────────────
function LanguageSheet({
  followHost,
  selectedCode,
  options,
  onChoose,
  onClose,
}: {
  followHost: boolean;
  selectedCode: string;
  options: Language[];
  onChoose: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = options.filter((l) =>
    `${l.name} ${l.code}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end bg-slate-950/35"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="mx-auto max-h-[76vh] w-full max-w-[560px] rounded-t-[22px] bg-white font-sans text-slate-900 shadow-modal"
        style={{ colorScheme: "light" }}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <div>
            <div className="text-[18px] font-semibold tracking-[-.02em]">
              Translation language
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              Choose what you want to read
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-lg bg-slate-100 text-slate-500"
          >
            <X className="size-4" />
          </button>
        </div>
        {options.length > 6 && (
          <div className="px-5 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search languages…"
                className="h-11 w-full rounded-[10px] border border-slate-200 bg-slate-50 pl-9 pr-3 text-[13px] outline-none focus:border-brand-500"
              />
            </div>
          </div>
        )}
        <div className="thin-scrollbar safe-bottom max-h-[52vh] overflow-y-auto px-3">
          <button
            onClick={() => onChoose("host")}
            className={cx(
              "flex min-h-[62px] w-full items-center gap-3 rounded-xl px-3 text-left",
              followHost ? "bg-brand-50" : "hover:bg-slate-50",
            )}
          >
            <div
              className={cx(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                followHost
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              <Radio className="size-4" />
            </div>
            <div className="flex-1">
              <div className="text-[13px] font-semibold">Follow Host</div>
              <div className="mt-1 text-[10px] text-slate-500">
                Use the language selected by the presenter
              </div>
            </div>
            {followHost && <Check className="size-4 text-brand-600" />}
          </button>
          <div className="my-2 h-px bg-slate-200" />
          {options.length === 0 && (
            <p className="px-3 py-4 text-center text-[12px] text-slate-500">
              The host hasn’t enabled any other languages for this room yet.
            </p>
          )}
          {filtered.map((l) => {
            const isSelected = !followHost && selectedCode === l.code;
            return (
              <button
                key={l.code}
                onClick={() => onChoose(l.code)}
                className={cx(
                  "flex min-h-[54px] w-full items-center gap-3 rounded-xl px-3 text-left",
                  isSelected ? "bg-brand-50" : "hover:bg-slate-50",
                )}
              >
                <span className="text-[20px] leading-none">{l.flag}</span>
                <div className="flex-1">
                  <div className="text-[13px] font-medium">{l.name}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                    {l.code}
                  </div>
                </div>
                {isSelected && <Check className="size-4 text-brand-600" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
