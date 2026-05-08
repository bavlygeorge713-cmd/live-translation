import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, Globe, Volume2, VolumeX } from "lucide-react";
import { useBroadcast } from "@/hooks/useBroadcast";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { LANGUAGES } from "@/types";

export function ViewerPage() {
  const { connected, lastMessage } = useBroadcast("viewer");
  const tts = useSpeechSynthesis();
  const ttsRef = useRef(tts);
  ttsRef.current = tts;

  const [displayText, setDisplayText] = useState<string>("");
  const [targetLang, setTargetLang] = useState<string>("");
  const [sourceLang, setSourceLang] = useState<string>("");
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const selectedVoiceURIRef = useRef("");
  selectedVoiceURIRef.current = selectedVoiceURI;
  const ttsEnabledRef = useRef(true);
  ttsEnabledRef.current = ttsEnabled;
  const audioUnlockedRef = useRef(false);
  audioUnlockedRef.current = audioUnlocked;
  const lastSpokenChunkRef = useRef("");
  const initializedRef = useRef(false); // true after the first (cached) message is skipped
  const localTextRef = useRef("");      // viewer-local accumulated text, starts empty on join
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleUnlockAudio = () => {
    window.speechSynthesis.cancel(); // warms up the audio API (requires user gesture)
    setAudioUnlocked(true);
  };

  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "translation") return;
    setTargetLang(lastMessage.targetLang ?? "");
    setSourceLang(lastMessage.sourceLang ?? "");

    const chunk = lastMessage.chunk ?? "";
    const interimChunk = lastMessage.interimChunk ?? "";
    const bcp47 = LANGUAGES.find((l) => l.code === lastMessage.targetLang)?.bcp47 ?? "en-US";
    const voiceURI = selectedVoiceURIRef.current || undefined;

    // First message is the Redis-cached state from before this viewer joined.
    // Mark its chunk as already-seen so the viewer starts clean.
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSpokenChunkRef.current = chunk;
      return;
    }

    // ── Display (viewer-local accumulation, starts empty on join) ────────────
    const isNewChunk = chunk && chunk !== lastSpokenChunkRef.current;
    if (isNewChunk) {
      localTextRef.current = localTextRef.current ? localTextRef.current + " " + chunk : chunk;
    }
    // Show accumulated finals; append interim preview while no new final is arriving
    setDisplayText(
      interimChunk && !isNewChunk
        ? (localTextRef.current ? localTextRef.current + " " + interimChunk : interimChunk)
        : localTextRef.current
    );

    // ── TTS — speak final phrases only, never interim ─────────────────────────
    if (!ttsEnabledRef.current || !audioUnlockedRef.current) {
      if (isNewChunk) lastSpokenChunkRef.current = chunk;
      return;
    }

    if (isNewChunk) {
      lastSpokenChunkRef.current = chunk;
      ttsRef.current.speak(chunk, bcp47, 1.0, voiceURI);
    }
  }, [lastMessage]);

  // Auto-scroll to bottom as text grows
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayText]);

  const tgtLang = LANGUAGES.find((l) => l.code === targetLang);
  const srcLang = LANGUAGES.find((l) => l.code === sourceLang);
  const availableVoices = tts.voicesForLang(tgtLang?.bcp47 ?? "en-US");

  // Dynamic font size based on text length
  const len = displayText.length;
  const fontSize =
    len === 0 ? 52 :
    len < 80  ? 52 :
    len < 200 ? 44 :
    len < 400 ? 36 :
    len < 700 ? 30 :
    len < 1100 ? 26 : 22;

  // Trim to only show the most recent text that fits the viewport.
  // (-webkit-line-clamp clips the bottom/newest — we trim the top/oldest instead)
  const charsPerLine = Math.max(20, Math.floor((window.innerWidth * 0.82) / (fontSize * 0.56)));
  const linesVisible = Math.max(2, Math.floor((window.innerHeight - 210) / (fontSize * 1.45)));
  const maxChars = charsPerLine * linesVisible;
  const visibleText = displayText.length > maxChars
    ? "…" + displayText.slice(-maxChars)
    : displayText;

  const rtlLangs = new Set(["ar", "he", "fa", "ur"]);
  const isRtl = rtlLangs.has(targetLang);

  return (
    <div className="h-screen bg-[#08080f] flex flex-col text-white overflow-hidden">

      {/* ── Tap-to-start overlay (browser requires a user gesture before TTS works) ── */}
      {!audioUnlocked && (
        <div
          onClick={handleUnlockAudio}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer bg-[#08080f]"
        >
          <motion.div
            animate={{ scale: [1, 1.18, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="mb-7"
          >
            <Volume2 className="size-16 text-blue-400" />
          </motion.div>
          <p className="text-white text-2xl font-semibold">Tap to start</p>
          <p className="text-slate-500 text-sm mt-2">Live translation with voice</p>
        </div>
      )}

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-white/[0.06]">

        {/* Row 1: Logo + title | connection status */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className="size-6 shrink-0 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20
              flex items-center justify-center border border-white/10">
              <Globe className="size-3 text-blue-400" />
            </div>
            <span className="text-sm font-semibold text-slate-200 truncate">HY Translator</span>
            <span className="text-[11px] text-slate-600 shrink-0">· Live View</span>
          </div>

          <div className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            connected
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-slate-500/10 border-slate-500/20 text-slate-500"
          }`}>
            {connected
              ? <><Wifi className="size-3" /><span>Connected</span></>
              : <><WifiOff className="size-3" /><span>Connecting…</span></>
            }
          </div>
        </div>

        {/* Row 2: Language pair | TTS controls */}
        <div className="flex items-center justify-between px-5 pb-2.5 gap-3">
          <div className="min-w-0 flex items-center">
            {srcLang && tgtLang ? (
              <span className="text-[11px] text-slate-500 truncate">
                {srcLang.flag} {srcLang.name} → {tgtLang.flag} {tgtLang.name}
              </span>
            ) : (
              <span className="text-[11px] text-slate-700">Waiting for presenter…</span>
            )}
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {/* TTS toggle */}
            <button
              onClick={() => { setTtsEnabled((v) => !v); if (ttsEnabled) tts.stop(); }}
              title={ttsEnabled ? "Mute audio" : "Enable audio"}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                ttsEnabled
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20"
                  : "bg-slate-500/10 border-slate-500/20 text-slate-500 hover:border-slate-400/30"
              }`}
            >
              {ttsEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              <span>{ttsEnabled ? "Audio on" : "Audio off"}</span>
            </button>

            {/* Voice selector */}
            {ttsEnabled && availableVoices.length > 0 && (
              <div className="relative">
                <select
                  value={selectedVoiceURI}
                  onChange={(e) => setSelectedVoiceURI(e.target.value)}
                  className="appearance-none bg-white/5 border border-white/10 text-slate-400
                    text-[11px] rounded-full px-3 py-1.5 pr-6 outline-none cursor-pointer
                    focus:border-blue-500/40 transition-colors w-[130px]"
                >
                  <option value="" className="bg-[#0d0d14]">Auto voice</option>
                  {availableVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI} className="bg-[#0d0d14]">{v.name}</option>
                  ))}
                </select>
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none text-[10px]">▾</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Top accent line ──────────────────────────────────────────────────── */}
      <div className="h-[3px] shrink-0 bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

      {/* ── Main translation area — single page, no overflow ─────────────────── */}
      <div ref={scrollRef} className="flex-1 min-h-0 flex flex-col px-8 py-8 overflow-hidden">
        {!displayText ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="flex justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="size-2.5 rounded-full bg-blue-500/40"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }}
                />
              ))}
            </div>
            <p className="text-slate-500 text-lg font-light">
              {connected ? "Waiting for the presenter to speak…" : "Connecting to presenter…"}
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Language badge */}
            {tgtLang && (
              <div className="flex items-center gap-2 mb-5 shrink-0">
                <span className="text-2xl">{tgtLang.flag}</span>
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium">
                  {tgtLang.name}
                </span>
              </div>
            )}

            {/* Translation text — always fits in the visible area */}
            <div className="flex-1 min-h-0 overflow-hidden flex items-start">
              <AnimatePresence mode="wait">
                <motion.p
                  key={displayText.length > 50 ? displayText.slice(-50) : displayText}
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 1 }}
                  dir={isRtl ? "rtl" : "ltr"}
                  className="text-white font-semibold w-full overflow-hidden"
                  style={{ fontSize: `${fontSize}px`, lineHeight: 1.45 }}
                >
                  {visibleText}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom accent ────────────────────────────────────────────────────── */}
      <div className="shrink-0 h-[2px] bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
      <div className="shrink-0 py-2 text-center">
        <p className="text-[10px] text-slate-700">HY Translator · Live Translation View</p>
      </div>
    </div>
  );
}
