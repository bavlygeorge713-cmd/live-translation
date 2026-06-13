import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, ArrowRight, Volume2, VolumeX } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { useStore } from "@/store/translationStore";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { LANGUAGES } from "@/types";

interface Props {
  translate: (text: string, src: string, tgt: string) => Promise<string>;
}

export function TextVoiceOver({ translate }: Props) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const store = useStore();
  const tts = useSpeechSynthesis();

  const targetLang = LANGUAGES.find((l) => l.code === store.targetLang);

  const handleTranslate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setOutput("");
    setError(null);
    try {
      const result = await translate(input, "auto", store.targetLang);
      setOutput(result);
    } catch (err) {
      setError((err as Error).message ?? "Translation failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard glow="purple" className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="size-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <FileText className="size-3.5 text-violet-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            Text Translator
          </h3>
          <p className="text-xs text-slate-500">Type text, translate, speak</p>
        </div>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type or paste text to translate…"
        rows={3}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm
          text-slate-200 placeholder-slate-600 resize-none outline-none
          focus:border-violet-500/40 transition-colors"
      />

      <Button
        variant="primary"
        size="sm"
        loading={loading}
        disabled={!input.trim()}
        onClick={handleTranslate}
        className="w-full"
      >
        <ArrowRight className="size-3.5" /> Translate
      </Button>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      <AnimatePresence>
        {output && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl px-4 py-3">
              <p className="text-xs text-slate-200 leading-relaxed">{output}</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="success"
                size="sm"
                onClick={() =>
                  tts.speak(
                    output,
                    targetLang?.bcp47 ?? "en-US",
                    store.speechRate,
                  )
                }
                disabled={tts.isPlaying}
                className="flex-1"
              >
                <Volume2 className="size-3.5" />{" "}
                {tts.isPlaying ? "Playing…" : "Speak"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={tts.stop}
                disabled={!tts.isPlaying}
              >
                <VolumeX className="size-3.5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
