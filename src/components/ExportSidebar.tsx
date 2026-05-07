import { RefObject, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Video, FileText, Clock, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useStore } from "@/store/translationStore";
import {
  useCanvasRecorder,
  FORMATS,
  RecordingFormat,
  isFormatSupported,
  supportsWebCodecs,
} from "@/hooks/useCanvasRecorder";
import { downloadVideo, downloadText, downloadSRT } from "@/lib/exportUtils";
import { CanvasHandle } from "@/components/SubtitleCanvas";

export function ExportSidebar({
  canvasRef,
  micStream,
}: {
  canvasRef: RefObject<CanvasHandle>;
  micStream: MediaStream | null;
}) {
  const { history, clearHistory } = useStore();
  const { isRecording, duration, start, stop } = useCanvasRecorder();
  const recAudioStreamRef = useRef<MediaStream | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoExt, setVideoExt] = useState(".mp4");
  const [recError, setRecError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [format, setFormat] = useState<RecordingFormat>("mp4");
  const [isFinalizing, setIsFinalizing] = useState(false);

  const webCodecsAvailable = supportsWebCodecs();

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const startRec = async () => {
    const canvas = canvasRef.current?.canvas;
    if (!canvas) { setRecError("Canvas not ready — reload the page."); return; }
    setVideoBlob(null);
    setRecError(null);

    // Always request a fresh audio stream for recording so it's independent of
    // the visualizer stream lifecycle (stopping the mic won't kill recording audio)
    let audioStream: MediaStream | undefined;
    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      recAudioStreamRef.current = audioStream;
    } catch {
      recAudioStreamRef.current = null;
    }

    await start(canvas, format, audioStream);
  };

  const stopRec = async () => {
    setIsFinalizing(true);
    try {
      const blob = await stop();
      // Stop the dedicated recording audio stream after encoder finishes
      recAudioStreamRef.current?.getTracks().forEach((t) => t.stop());
      recAudioStreamRef.current = null;
      if (blob) {
        setVideoBlob(blob);
        setVideoExt(FORMATS.find((f) => f.id === format)?.ext ?? ".webm");
      }
    } catch (e) {
      setRecError((e as Error).message);
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Video recording ─────────────────────────── */}
      <GlassCard glow="purple">
        <div className="flex items-center gap-2 mb-4">
          <div className="size-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Video className="size-3.5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Video Recording</h3>
            <p className="text-xs text-slate-500">Canvas + mic audio</p>
          </div>
        </div>

        {/* Format selector */}
        <div className="space-y-1.5 mb-4">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            Format & Codec
          </label>

          {!webCodecsAvailable && (
            <p className="text-[10px] text-amber-500/80 bg-amber-500/5 border border-amber-500/10 rounded-lg px-2 py-1.5">
              MP4 requires Chrome 94+ or Edge 94+. Only WebM is available in this browser.
            </p>
          )}

          <div className="space-y-1.5">
            {FORMATS.map((f) => {
              const supported = isFormatSupported(f);
              const selected = format === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => supported && !isRecording && setFormat(f.id)}
                  disabled={!supported || isRecording}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium border transition-all
                    ${selected && supported
                      ? "bg-violet-600/20 border-violet-500/40 text-violet-300"
                      : supported && !isRecording
                      ? "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300"
                      : "bg-white/[0.02] border-white/5 text-slate-700 cursor-not-allowed"
                    }`}
                >
                  <span className="flex items-center justify-between">
                    <span>
                      {f.label}
                      {!supported && (
                        <span className="ml-1 text-slate-700">— not supported</span>
                      )}
                    </span>
                    {selected && supported && <span className="text-violet-400 text-[10px]">✓ selected</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Timer */}
        {isRecording && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">
            <span className="size-2 rounded-full bg-red-500 animate-[recordPulse_1.5s_ease-in-out_infinite]" />
            <span className="text-xs font-mono text-red-300">{fmt(duration)}</span>
            <span className="text-xs text-slate-500">Recording…</span>
          </div>
        )}

        {isFinalizing && (
          <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2 mb-3">
            <span className="size-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            <span className="text-xs text-blue-300">Encoding & muxing{format === "mp4" ? " MP4" : ""}…</span>
          </div>
        )}

        <div className="flex gap-2">
          {!isRecording ? (
            <Button variant="danger" size="sm" onClick={startRec} disabled={isFinalizing} className="flex-1">
              ● Start Rec
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={stopRec} className="flex-1">
              ■ Stop & Save
            </Button>
          )}
        </div>

        {videoBlob && (
          <Button
            variant="success"
            size="sm"
            onClick={() => downloadVideo(videoBlob, videoExt)}
            className="w-full mt-2"
          >
            ↓ Download {videoExt.toUpperCase()} ({(videoBlob.size / 1_000_000).toFixed(1)} MB)
          </Button>
        )}

        {recError && <p className="text-xs text-red-400 mt-2">{recError}</p>}
      </GlassCard>

      {/* ── Text export ──────────────────────────────── */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <div className="size-7 rounded-lg bg-white/5 flex items-center justify-center">
            <FileText className="size-3.5 text-slate-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Text Export</h3>
            <p className="text-xs text-slate-500">{history.length} translation{history.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={!history.length}
            onClick={() => downloadText(history)} className="flex-1">.txt</Button>
          <Button variant="secondary" size="sm" disabled={!history.length}
            onClick={() => downloadSRT(history)} className="flex-1">.srt</Button>
        </div>
      </GlassCard>

      {/* ── History ──────────────────────────────────── */}
      <GlassCard>
        <div className="flex items-center justify-between cursor-pointer mb-3"
          onClick={() => setShowHistory((v) => !v)}>
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-white/5 flex items-center justify-center">
              <Clock className="size-3.5 text-slate-400" />
            </div>
            <span className="text-sm font-semibold text-slate-200">History</span>
            {history.length > 0 && <Badge variant="blue">{history.length}</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button onClick={(e) => { e.stopPropagation(); clearHistory(); }}
                className="text-slate-600 hover:text-red-400 transition-colors">
                <Trash2 className="size-3.5" />
              </button>
            )}
            {showHistory ? <ChevronUp className="size-4 text-slate-500" />
              : <ChevronDown className="size-4 text-slate-500" />}
          </div>
        </div>

        <AnimatePresence>
          {showHistory && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              {history.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-3">No translations yet</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {history.map((e) => (
                    <motion.div key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                      className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-600">
                          {new Date(e.timestamp).toLocaleTimeString()}
                        </span>
                        <div className="flex gap-1">
                          <Badge variant="slate">{e.sourceLang}</Badge>
                          <span className="text-slate-700 text-xs">→</span>
                          <Badge variant="blue">{e.targetLang}</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 truncate">{e.originalText}</p>
                      <p className="text-xs text-slate-300 truncate">{e.translatedText}</p>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </div>
  );
}
