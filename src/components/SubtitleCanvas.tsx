import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { motion } from "framer-motion";
import { useStore } from "@/store/translationStore";
import { drawSubtitleFrame } from "@/lib/exportUtils";

const W = 1280;
const H = 720;

const LIVE_STYLE = `
@keyframes liveDot {
  0%, 100% { transform: scale(1);   background-color: #ef4444; box-shadow: 0 0 4px #ef4444; }
  50%       { transform: scale(1.3); background-color: #ff2222; box-shadow: 0 0 8px #ff2222; }
}
@keyframes liveBadgePulse {
  0%, 100% { background-color: rgba(239,68,68,0.15); box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
  50%       { background-color: rgba(239,68,68,0.28); box-shadow: 0 0 0 4px rgba(239,68,68,0); }
}
`;

function injectLiveStyle() {
  if (document.getElementById("live-canvas-style")) return;
  const el = document.createElement("style");
  el.id = "live-canvas-style";
  el.textContent = LIVE_STYLE;
  document.head.appendChild(el);
}

export interface CanvasHandle {
  canvas: HTMLCanvasElement | null;
  liveDiv: HTMLDivElement | null;
}

interface SubtitleCanvasProps {
  micStream: MediaStream | null;
  isRecording?: boolean;
  recDuration?: number;
}

export const SubtitleCanvas = forwardRef<CanvasHandle, SubtitleCanvasProps>(
  function SubtitleCanvas(
    { micStream, isRecording = false, recDuration = 0 },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const liveDivRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const { sentences, sentenceHistory, interimTranscript, processingState } =
      useStore();

    useImperativeHandle(ref, () => ({
      canvas: canvasRef.current,
      liveDiv: liveDivRef.current,
    }));

    useEffect(() => {
      injectLiveStyle();
    }, []);

    const sentencesRef = useRef(sentences);
    const stateRef = useRef(processingState);
    sentencesRef.current = sentences;
    stateRef.current = processingState;

    // Hidden recording canvas draw loop
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      let stopped = false;
      const draw = () => {
        if (stopped) return;
        const allText = sentencesRef.current
          .map((s) => s.text)
          .filter(Boolean)
          .join(" ");
        drawSubtitleFrame(ctx, allText, "", stateRef.current, W, H);
        frameRef.current = requestAnimationFrame(draw);
      };
      frameRef.current = requestAnimationFrame(draw);
      return () => {
        stopped = true;
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
      };
    }, []);

    // Auto-scroll to bottom on every new line or word append
    useEffect(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, [sentences]);

    const isLive = !!micStream;

    return (
      <>
        {/* Hidden recording canvas */}
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          style={{ display: "none" }}
        />

        <div
          ref={liveDivRef}
          style={{
            width: "100%",
            height: "400px",
            borderRadius: "12px",
            overflow: "hidden",
            backgroundColor: "#000000",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "14px 20px 10px 20px",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#ffffff",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              Live Translation
            </span>

            {isLive && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "3px 10px 3px 7px",
                  borderRadius: "999px",
                  border: "1px solid rgba(239,68,68,0.35)",
                  animation: "liveBadgePulse 1.5s ease-in-out infinite",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    animation: "liveDot 1.5s ease-in-out infinite",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#ef4444",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  Live
                </span>
              </span>
            )}

            {isRecording && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "3px 8px",
                  borderRadius: "999px",
                  backgroundColor: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.4)",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    backgroundColor: "#ef4444",
                    animation: "liveDot 1.5s ease-in-out infinite",
                  }}
                />
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#ef4444",
                    fontFamily: "monospace",
                    letterSpacing: "0.05em",
                    lineHeight: 1,
                  }}
                >
                  REC {String(Math.floor(recDuration / 60)).padStart(2, "0")}:
                  {String(recDuration % 60).padStart(2, "0")}
                </span>
              </span>
            )}
          </div>

          {/* ── Sentences — scrollable ── */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "4px 20px 12px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            {sentences.length === 0 && (
              <p
                style={{
                  fontSize: "14px",
                  color: "rgba(100,116,139,0.4)",
                  margin: 0,
                }}
              >
                Press Start and begin speaking…
              </p>
            )}

            {sentences.map((entry) => {
              const showCursor = !entry.frozen && entry.text.length > 0;
              return (
                <motion.p
                  key={entry.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    fontSize: "28px",
                    color: "#ffffff",
                    lineHeight: "1.5",
                    margin: 0,
                  }}
                >
                  {entry.text}
                  {showCursor && (
                    <span
                      className="animate-pulse"
                      style={{
                        display: "inline-block",
                        width: "2px",
                        height: "28px",
                        marginLeft: "6px",
                        backgroundColor: "#60a5fa",
                        borderRadius: "2px",
                        verticalAlign: "middle",
                      }}
                    />
                  )}
                </motion.p>
              );
            })}
          </div>

          {/* ── Gray source transcript footer ── */}
          <div
            style={{
              flexShrink: 0,
              padding: "8px 16px",
              borderTop: "1px solid #222222",
              color: "#888888",
              fontSize: "14px",
              lineHeight: "1.4",
              minHeight: "36px",
            }}
          >
            {interimTranscript ||
              (sentences.length > 0 && (
                <span style={{ opacity: 0.4 }}>
                  {sentences.length} line{sentences.length !== 1 ? "s" : ""}
                  {sentenceHistory.length > 0 &&
                    ` · ${sentenceHistory.length} archived`}
                </span>
              ))}
          </div>
        </div>
      </>
    );
  },
);
