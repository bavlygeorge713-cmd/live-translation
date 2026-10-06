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
      <div className="flex items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-tertiary">
          <FileText className="size-4" />
        </div>
        <div>
          <h3 className="text-[14px] font-semibold text-primary">
            Text Translator
          </h3>
          <p className="mt-0.5 text-[11px] text-tertiary">
            Type text, translate, speak
          </p>
        </div>
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type or paste text to translate…"
        rows={3}
        className="focus-ring w-full resize-none rounded-[10px] border border-app bg-[var(--surface)] px-3.5 py-3 text-[13px]
          text-primary outline-none transition placeholder:text-[var(--muted)]
          hover:border-[var(--border-strong)]"
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
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 dark:border-rose-400/30 dark:bg-rose-500/10">
          <p className="text-[12px] text-rose-700 dark:text-rose-200">{error}</p>
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
            <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-400/30 dark:bg-brand-500/10">
              <p className="text-[13px] leading-relaxed text-primary">
                {output}
              </p>
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
