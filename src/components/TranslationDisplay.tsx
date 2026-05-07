import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/store/translationStore";
import { LANGUAGES } from "@/types";

export function TranslationDisplay() {
  const { translatedText, transcribedText, targetLang, sourceLang, processingState } = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as text grows
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [translatedText, transcribedText]);

  const tgtInfo = LANGUAGES.find((l) => l.code === targetLang);
  const srcInfo = LANGUAGES.find((l) => l.code === sourceLang);

  const hasTranslation = !!translatedText;
  const hasAnything = !!translatedText || !!transcribedText;

  const isActive =
    processingState === "transcribing" ||
    processingState === "translating" ||
    processingState === "speaking";

  // Dynamic font size — shrinks as text grows (like a teleprompter)
  const len = translatedText.length;
  const fontSize =
    len === 0 ? 64 :
    len < 80  ? 64 :
    len < 200 ? 52 :
    len < 400 ? 44 :
    len < 700 ? 36 :
    len < 1100 ? 30 : 24;

  // Detect if target is RTL
  const rtlLangs = new Set(["ar", "he", "fa", "ur"]);
  const textDir = rtlLangs.has(targetLang) ? "rtl" : "ltr";

  return (
    <div className="flex-1 flex flex-col min-h-0 select-text">

      {/* ── Language badge strip ───────────────────────────────────────────── */}
      <div className="shrink-0 px-10 pt-8 pb-4 flex items-center gap-3">
        {tgtInfo && (
          <div className="flex items-center gap-2.5">
            <span className="text-3xl">{tgtInfo.flag}</span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium leading-none mb-0.5">
                Translation
              </p>
              <p className="text-sm font-semibold text-slate-300">{tgtInfo.name}</p>
            </div>
          </div>
        )}

        {/* Processing indicator */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="ml-auto flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20"
            >
              <span className="size-1.5 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-[11px] font-medium text-blue-300">
                {processingState === "transcribing" && "Listening…"}
                {processingState === "translating" && "Translating…"}
                {processingState === "speaking" && "Speaking…"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Main translation text ──────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-10 pb-6 min-h-0"
      >
        {!hasAnything ? (
          /* ── Idle placeholder ─────────────────────────────────────────── */
          <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
            <div className="size-20 rounded-3xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-white/5 flex items-center justify-center">
              <span className="text-4xl">{tgtInfo?.flag ?? "🌐"}</span>
            </div>
            <div>
              <p className="text-slate-400 text-xl font-medium mb-2">
                Ready to translate
              </p>
              <p className="text-slate-600 text-sm max-w-xs leading-relaxed">
                Press <span className="text-blue-400">Start Speaking</span> below, then speak in{" "}
                {srcInfo?.name ?? "your language"}. Translation into {tgtInfo?.name ?? "the target language"} will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* ── Translated text (hero) ─────────────────────────────────── */}
            {hasTranslation && (
              <p
                dir={textDir}
                className="font-semibold text-white leading-relaxed transition-all duration-500"
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.45 }}
              >
                {translatedText}
                {isActive && (
                  <span className="inline-block w-[3px] ml-2 animate-pulse bg-blue-400 rounded-full align-middle"
                    style={{ height: `${Math.round(fontSize * 0.85)}px` }} />
                )}
              </p>
            )}

            {/* ── If no translation yet, show transcript as placeholder ──── */}
            {!hasTranslation && transcribedText && (
              <p
                className="font-medium text-slate-400 leading-relaxed transition-all duration-500"
                style={{ fontSize: `${fontSize}px`, lineHeight: 1.45 }}
              >
                {transcribedText}
                {isActive && (
                  <span className="inline-block w-[3px] ml-2 animate-pulse bg-slate-500 rounded-full align-middle"
                    style={{ height: `${Math.round(fontSize * 0.85)}px` }} />
                )}
              </p>
            )}

            {/* ── Original transcript (below divider) ───────────────────── */}
            {hasTranslation && transcribedText && (
              <div className="border-t border-white/[0.06] pt-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600 font-medium mb-2">
                  {srcInfo?.name ?? "Original"}
                </p>
                <p className="text-slate-500 text-base leading-relaxed">
                  {transcribedText}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
