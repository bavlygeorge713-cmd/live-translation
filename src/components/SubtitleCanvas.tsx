import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/store/translationStore";
import { drawSubtitleFrame } from "@/lib/exportUtils";
import { AudioVisualizer } from "@/components/AudioVisualizer";
import { Badge } from "@/components/ui/Badge";

const W = 1280;
const H = 720;

export interface CanvasHandle {
  canvas: HTMLCanvasElement | null;
}

export const SubtitleCanvas = forwardRef<CanvasHandle, { micStream: MediaStream | null }>(
  function SubtitleCanvas({ micStream }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const frameRef = useRef<number | null>(null);
    const { translatedText, transcribedText, processingState } = useStore();

    useImperativeHandle(ref, () => ({ canvas: canvasRef.current }));

    // Mirror reactive values into refs so the rAF loop always reads the latest
    const translatedRef = useRef(translatedText);
    const transcribedRef = useRef(transcribedText);
    const stateRef = useRef(processingState);
    translatedRef.current = translatedText;
    transcribedRef.current = transcribedText;
    stateRef.current = processingState;

    // Single long-lived draw loop — reads from refs so it never needs restarting
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let stopped = false;

      const draw = () => {
        if (stopped) return;
        drawSubtitleFrame(ctx, translatedRef.current, transcribedRef.current, stateRef.current, W, H);
        frameRef.current = requestAnimationFrame(draw);
      };

      frameRef.current = requestAnimationFrame(draw);

      return () => {
        stopped = true;
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
      };
    }, []); // runs once — reads current values through refs

    const isLive = processingState !== "idle" && processingState !== "error";

    return (
      <div className="flex flex-col gap-3">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-200">Live Canvas</h2>
            {isLive && <Badge variant="red" dot>Live</Badge>}
          </div>
          <AudioVisualizer stream={micStream} isActive={!!micStream} color="blue" bars={16} height={22} />
        </div>

        {/* Canvas — aspect-video keeps 16:9 regardless of parent height */}
        <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0d0d0f]">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="absolute inset-0 w-full h-full"
          />

          {/* Processing chip */}
          <AnimatePresence>
            {isLive && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-3 right-3"
              >
                <div className="flex items-center gap-2 bg-black/80 border border-white/10 rounded-xl px-3 py-1.5 backdrop-blur">
                  <span className="size-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                  <span className="text-xs text-slate-300">
                    {processingState === "transcribing" && "Transcribing…"}
                    {processingState === "translating" && "Translating…"}
                    {processingState === "speaking" && "Speaking…"}
                    {processingState === "loading_stt" && "Loading Whisper…"}
                    {processingState === "loading_translation" && "Loading model…"}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Original transcript */}
        <AnimatePresence>
          {transcribedText && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3"
            >
              <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-1.5 font-medium">
                Original (transcribed)
              </p>
              <p className="text-sm text-slate-400 leading-relaxed">{transcribedText}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);
