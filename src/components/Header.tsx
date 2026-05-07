import { motion } from "framer-motion";
import { Mic2, Globe } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useStore } from "@/store/translationStore";

export function Header() {
  const { processingState } = useStore();

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-40 bg-[rgba(13,13,15,0.85)] backdrop-blur-xl border-b border-white/[0.06]"
    >
      <div className="max-w-[1500px] mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center">
            <Mic2 className="size-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
              HY Translator
            </span>
            <p className="text-[10px] text-slate-600 -mt-0.5">Real-time Speech Translation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {processingState === "transcribing" && <Badge variant="blue" dot>Transcribing…</Badge>}
          {processingState === "translating" && <Badge variant="purple" dot>Translating…</Badge>}
          {processingState === "speaking" && <Badge variant="emerald" dot>Speaking…</Badge>}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Globe className="size-3.5" />
          Web Speech · Online Translation
        </div>
      </div>
    </motion.header>
  );
}
