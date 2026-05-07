import { motion, AnimatePresence } from "framer-motion";
import { Download, Cpu } from "lucide-react";
import { ModelProgress } from "@/types";

function shortName(modelName: string) {
  // "Xenova/whisper-tiny" → "whisper-tiny"
  return modelName.split("/").pop() ?? modelName;
}

function shortFile(file?: string) {
  if (!file) return null;
  // "onnx/encoder_model_quantized.onnx" → "encoder_model_quantized.onnx"
  return file.split("/").pop() ?? file;
}

function StatusCard({ progress, label }: { progress: ModelProgress; label: string }) {
  const isDownloading = progress.status === "downloading";
  return (
    <div className="flex items-center gap-3">
      <div className="size-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
        {isDownloading
          ? <Download className="size-4 text-blue-400 animate-bounce" />
          : <Cpu className="size-4 text-violet-400 animate-pulse" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-slate-200 truncate">
            {label} · {shortName(progress.modelName)}
          </p>
          {isDownloading && progress.percent > 0 && (
            <span className="text-xs font-mono text-blue-400 ml-2 shrink-0">
              {progress.percent}%
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
            animate={{
              width: isDownloading && progress.percent > 0
                ? `${progress.percent}%`
                : "100%",
              opacity: isDownloading && progress.percent === 0 ? 0.4 : 1,
            }}
            transition={{ duration: 0.25 }}
            style={{
              backgroundSize: isDownloading && progress.percent === 0 ? "200% 100%" : undefined,
            }}
          />
        </div>

        <p className="text-[10px] text-slate-600 truncate mt-1">
          {isDownloading && progress.percent === 0
            ? "Starting download…"
            : isDownloading
            ? shortFile(progress.file) ?? "Downloading…"
            : "Loading into memory…"
          }
        </p>
      </div>
    </div>
  );
}

export function ModelStatus({
  stt,
  translation,
}: {
  stt: ModelProgress | null;
  translation: ModelProgress | null;
}) {
  const active = stt ?? translation;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.97 }}
          transition={{ duration: 0.2 }}
          className="fixed top-[68px] left-1/2 -translate-x-1/2 z-50 w-[380px] max-w-[calc(100vw-2rem)]
            bg-[rgba(14,14,18,0.97)] backdrop-blur-xl border border-white/10
            rounded-2xl px-5 py-4 shadow-2xl shadow-black/60"
        >
          <div className="flex flex-col gap-3">
            {stt && <StatusCard progress={stt} label="STT" />}
            {translation && <StatusCard progress={translation} label="Translation" />}
          </div>
          <p className="text-[10px] text-slate-700 mt-3 text-center">
            Downloaded once · cached in browser · works offline after
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
