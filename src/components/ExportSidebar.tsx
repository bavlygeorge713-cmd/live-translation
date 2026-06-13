import { RefObject, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video,
  FileText,
  Clock,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useStore } from "@/store/translationStore";
import { useCanvasRecorder } from "@/hooks/useCanvasRecorder";
import { downloadText, downloadSRT } from "@/lib/exportUtils";
import { CanvasHandle } from "@/components/SubtitleCanvas";

export function ExportSidebar({
  canvasRef,
  micStream,
  onRecordingChange,
}: {
  canvasRef: RefObject<CanvasHandle>;
  micStream: MediaStream | null;
  onRecordingChange?: (isRecording: boolean, duration: number) => void;
}) {
  const { history, clearHistory } = useStore();
  const { isRecording, duration, start, stop } = useCanvasRecorder();
  const [recError, setRecError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Relay recording state to parent so SubtitleCanvas can show the REC timer
  useEffect(() => {
    onRecordingChange?.(isRecording, duration);
  }, [isRecording, duration, onRecordingChange]);

  const startRec = async () => {
    const liveDiv = canvasRef.current?.liveDiv;
    if (!liveDiv) {
      setRecError("Live canvas not ready — reload the page.");
      return;
    }
    setRecError(null);
    try {
      await start(liveDiv);
    } catch (e) {
      setRecError((e as Error).message);
    }
  };

  const stopRec = () => {
    stop();
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
            <h3 className="text-sm font-semibold text-slate-200">
              Video Recording
            </h3>
            <p className="text-xs text-slate-500">
              Live canvas + mic audio · MP4 / WebM
            </p>
          </div>
        </div>

        {/* Timer */}
        {isRecording && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">
            <span className="size-2 rounded-full bg-red-500 animate-[recordPulse_1.5s_ease-in-out_infinite]" />
            <span className="text-xs font-mono text-red-300">
              {fmt(duration)}
            </span>
            <span className="text-xs text-slate-500">Recording…</span>
          </div>
        )}

        <div className="flex gap-2">
          {!isRecording ? (
            <Button
              variant="danger"
              size="sm"
              onClick={startRec}
              className="flex-1"
            >
              ● Start Rec
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={stopRec}
              className="flex-1"
            >
              ■ Stop &amp; Download
            </Button>
          )}
        </div>

        {recError && <p className="text-xs text-red-400 mt-2">{recError}</p>}

        {!isRecording && (
          <p className="text-[10px] text-slate-600 mt-2">
            Auto-downloads as .mp4 (or .webm if MP4 unsupported)
          </p>
        )}
      </GlassCard>

      {/* ── Text export ──────────────────────────────── */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <div className="size-7 rounded-lg bg-white/5 flex items-center justify-center">
            <FileText className="size-3.5 text-slate-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Text Export
            </h3>
            <p className="text-xs text-slate-500">
              {history.length} translation{history.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!history.length}
            onClick={() => downloadText(history)}
            className="flex-1"
          >
            .txt
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!history.length}
            onClick={() => downloadSRT(history)}
            className="flex-1"
          >
            .srt
          </Button>
        </div>
      </GlassCard>

      {/* ── History ──────────────────────────────────── */}
      <GlassCard>
        <div
          className="flex items-center justify-between cursor-pointer mb-3"
          onClick={() => setShowHistory((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-white/5 flex items-center justify-center">
              <Clock className="size-3.5 text-slate-400" />
            </div>
            <span className="text-sm font-semibold text-slate-200">
              History
            </span>
            {history.length > 0 && (
              <Badge variant="blue">{history.length}</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearHistory();
                }}
                className="text-slate-600 hover:text-red-400 transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            {showHistory ? (
              <ChevronUp className="size-4 text-slate-500" />
            ) : (
              <ChevronDown className="size-4 text-slate-500" />
            )}
          </div>
        </div>

        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {history.length === 0 ? (
                <p className="text-xs text-slate-600 text-center py-3">
                  No translations yet
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {history.map((e) => (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 space-y-1"
                    >
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
                      <p className="text-xs text-slate-500 truncate">
                        {e.originalText}
                      </p>
                      <p className="text-xs text-slate-300 truncate">
                        {e.translatedText}
                      </p>
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
