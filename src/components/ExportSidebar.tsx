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
        <div className="mb-4 flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-tertiary">
            <Video className="size-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-primary">
              Video Recording
            </h3>
            <p className="mt-0.5 text-[11px] text-tertiary">
              Live canvas + mic audio · MP4 / WebM
            </p>
          </div>
        </div>

        {/* Timer */}
        {isRecording && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
            <span className="size-2 rounded-full bg-rose-500 animate-[recordPulse_1.5s_ease-in-out_infinite]" />
            <span className="font-mono text-[12px] font-semibold text-rose-700">
              {fmt(duration)}
            </span>
            <span className="text-[12px] text-secondary">Recording…</span>
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

        {recError && (
          <p className="mt-2 text-[12px] text-rose-700">{recError}</p>
        )}

        {!isRecording && (
          <p className="mt-2 text-[11px] text-tertiary">
            Auto-downloads as .mp4 (or .webm if MP4 unsupported)
          </p>
        )}
      </GlassCard>

      {/* ── Text export ──────────────────────────────── */}
      <GlassCard>
        <div className="mb-3 flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-tertiary">
            <FileText className="size-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-primary">
              Text Export
            </h3>
            <p className="mt-0.5 text-[11px] text-tertiary">
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
          className="mb-3 flex cursor-pointer items-center justify-between"
          onClick={() => setShowHistory((v) => !v)}
        >
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-tertiary">
              <Clock className="size-4" />
            </div>
            <span className="text-[14px] font-semibold text-primary">
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
                className="rounded-md p-1 text-tertiary transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            {showHistory ? (
              <ChevronUp className="size-4 text-tertiary" />
            ) : (
              <ChevronDown className="size-4 text-tertiary" />
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
                <p className="py-3 text-center text-[12px] text-tertiary">
                  No translations yet
                </p>
              ) : (
                <div className="thin-scrollbar max-h-60 space-y-2 overflow-y-auto pr-1">
                  {history.map((e) => (
                    <motion.div
                      key={e.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-1 rounded-xl border border-app bg-[var(--surface-2)] px-3 py-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold tabular-nums text-tertiary">
                          {new Date(e.timestamp).toLocaleTimeString()}
                        </span>
                        <div className="flex gap-1">
                          <Badge variant="slate">{e.sourceLang}</Badge>
                          <span className="text-xs text-tertiary">→</span>
                          <Badge variant="blue">{e.targetLang}</Badge>
                        </div>
                      </div>
                      <p className="truncate text-[12px] text-tertiary">
                        {e.originalText}
                      </p>
                      <p className="truncate text-[12px] text-primary">
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
