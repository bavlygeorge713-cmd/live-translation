import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { motion } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useStore } from "@/store/translationStore";
import { drawSubtitleFrame } from "@/lib/exportUtils";

const W = 1280;
const H = 720;

const THEME_KEY = "ct_canvas_theme";

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

    const [isDark, setIsDark] = useState<boolean>(
      () => (localStorage.getItem(THEME_KEY) ?? "dark") !== "light",
    );

    const toggleTheme = () => {
      setIsDark((prev) => {
        const next = !prev;
        localStorage.setItem(THEME_KEY, next ? "dark" : "light");
        return next;
      });
    };

    // Theme-derived colors
    const bg = isDark ? "#080D14" : "#FBFCFE";
    const textPrimary = isDark ? "#F8FAFC" : "#101828";
    const textPrev = isDark ? "#CBD5E1" : "#344054";
    const textOld = isDark ? "#8A99AC" : "#667085";
    const textEmpty = isDark ? "#718096" : "#667085";
    const footerBorder = isDark ? "#202C3A" : "#E4E7EC";
    const footerText = isDark ? "#718096" : "#667085";
    const speakingBg = isDark ? "rgba(59,130,246,0.12)" : "#EFF6FF";
    const speakingEdge = isDark ? "#60A5FA" : "#2563EB";
    const btnBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
    const btnBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
    const btnColor = isDark ? "#718096" : "#667085";
    const colorTransition =
      "background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease";

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
        {/* Hidden recording canvas — always dark, unaffected by theme toggle */}
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
            height: "460px",
            borderRadius: "20px",
            border: `1px solid ${footerBorder}`,
            overflow: "hidden",
            backgroundColor: bg,
            display: "flex",
            flexDirection: "column",
            transition: colorTransition,
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "14px 20px",
              borderBottom: `1px solid ${footerBorder}`,
              flexShrink: 0,
              transition: colorTransition,
            }}
          >
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: textPrimary,
                transition: colorTransition,
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

            {/* Theme toggle — pushes to the right */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                border: `1px solid ${btnBorder}`,
                backgroundColor: btnBg,
                cursor: "pointer",
                color: btnColor,
                flexShrink: 0,
                transition: colorTransition,
                padding: 0,
              }}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>

          {/* ── Sentences — scrollable ── */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 24px 20px 24px",
              display: "flex",
              flexDirection: "column",
              gap: "18px",
              fontFamily: '"Noto Sans", "Noto Sans Arabic", sans-serif',
            }}
          >
            {sentences.length === 0 && (
              <p
                style={{
                  fontSize: "14px",
                  color: textEmpty,
                  margin: 0,
                  transition: colorTransition,
                }}
              >
                Press Start and begin speaking…
              </p>
            )}

            {sentences.map((entry, idx) => {
              const showCursor = !entry.frozen && entry.text.length > 0;
              // Style only: newest line sits in a highlighted card, older lines fade
              const isCurrent = idx === sentences.length - 1;
              const isPrev = idx === sentences.length - 2;
              return (
                <motion.p
                  key={entry.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    fontSize: "28px",
                    fontWeight: 500,
                    color: isCurrent
                      ? textPrimary
                      : isPrev
                        ? textPrev
                        : textOld,
                    lineHeight: "1.5",
                    margin: 0,
                    transition: colorTransition,
                    ...(isCurrent
                      ? {
                          backgroundColor: speakingBg,
                          borderLeft: `3px solid ${speakingEdge}`,
                          borderRadius: "12px",
                          padding: "12px 16px",
                        }
                      : {}),
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
              padding: "10px 20px",
              borderTop: `1px solid ${footerBorder}`,
              color: footerText,
              fontSize: "13px",
              lineHeight: "1.4",
              minHeight: "36px",
              transition: colorTransition,
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
