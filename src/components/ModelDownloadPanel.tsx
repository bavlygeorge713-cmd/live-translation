import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useWhisperSTT } from "@/hooks/useWhisperSTT";
import { useLocalTranslation } from "@/hooks/useLocalTranslation";
import { TO_EN, FROM_EN } from "@/lib/translationModels";
import { WHISPER_MODELS } from "@/types";

// All translation models in one flat list
const ALL_TRANSLATION_MODELS = Array.from(
  new Set([...Object.values(TO_EN).filter((m) => !m.includes("_default")), ...Object.values(FROM_EN)])
);

interface Props {
  sttHook: ReturnType<typeof useWhisperSTT>;
  translateHook: ReturnType<typeof useLocalTranslation>;
}

export function ModelDownloadPanel({ sttHook, translateHook }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [done, setDone] = useState(false);

  const totalModels = WHISPER_MODELS.length + ALL_TRANSLATION_MODELS.length;
  const loadedCount = sttHook.cachedModels.size + translateHook.loadedModels.size;

  const currentLabel =
    sttHook.modelProgress?.modelName ??
    translateHook.modelProgress?.modelName ??
    null;

  const currentPct =
    sttHook.modelProgress?.percent ??
    translateHook.modelProgress?.percent ??
    0;

  const handleDownloadAll = async () => {
    setDownloading(true);
    setDone(false);

    // Download all Whisper models sequentially
    for (const m of WHISPER_MODELS) {
      try {
        await sttHook.preloadAsync(m.id);
      } catch (err) {
        console.error(`[Download] Whisper ${m.id} failed:`, err);
        // Continue to next model even if one fails
      }
    }

    // Download all translation models sequentially
    for (const model of ALL_TRANSLATION_MODELS) {
      try {
        await translateHook.preloadModelAsync(model);
      } catch (err) {
        console.error(`[Download] Translation ${model} failed:`, err);
        // Continue to next model
      }
    }

    setDownloading(false);
    setDone(true);
  };

  const activeProgress = sttHook.modelProgress ?? translateHook.modelProgress;

  return (
    <GlassCard glow="emerald" className="flex flex-col gap-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Download className="size-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">Download All Models</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {loadedCount}/{totalModels} cached · ~2 GB total · offline after
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {done && <CheckCircle2 className="size-4 text-emerald-400" />}
          {downloading && <Loader2 className="size-4 text-blue-400 animate-spin" />}
          {expanded ? <ChevronUp className="size-4 text-slate-500" /> : <ChevronDown className="size-4 text-slate-500" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pt-1">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Downloads all Whisper speech-to-text models and all language translation
                models at once. After downloading, the app works fully offline on any
                language pair without any additional waits.
              </p>

              {/* Current download progress */}
              {activeProgress && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400 truncate">
                      {currentLabel?.split("/").pop() ?? "Loading…"}
                    </span>
                    {currentPct > 0 && (
                      <span className="text-blue-400 font-mono ml-2 shrink-0">{currentPct}%</span>
                    )}
                  </div>
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
                      animate={{ width: currentPct > 0 ? `${currentPct}%` : "100%" }}
                      transition={{ duration: 0.25 }}
                      style={{ opacity: currentPct === 0 ? 0.4 : 1 }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-600">
                    {loadedCount} of {totalModels} models cached
                  </p>
                </div>
              )}

              <Button
                variant={done ? "success" : "primary"}
                size="sm"
                onClick={handleDownloadAll}
                loading={downloading}
                disabled={downloading || done}
                className="w-full"
              >
                {done
                  ? <><CheckCircle2 className="size-3.5" /> All Models Downloaded</>
                  : <><Download className="size-3.5" /> Download All Models (~2 GB)</>
                }
              </Button>

              <p className="text-[10px] text-slate-700 text-center">
                Models are cached in your browser — only downloaded once
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
