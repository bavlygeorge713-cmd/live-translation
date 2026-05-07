import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { LanguageSelector } from "@/components/LanguageSelector";
import { MicrophonePanel } from "@/components/MicrophonePanel";
import { SubtitleCanvas, CanvasHandle } from "@/components/SubtitleCanvas";
import { TextVoiceOver } from "@/components/TextVoiceOver";
import { ExportSidebar } from "@/components/ExportSidebar";
import { QRSharePanel } from "@/components/QRSharePanel";
import { useOnlineTranslation } from "@/hooks/useOnlineTranslation";
import { useBroadcast } from "@/hooks/useBroadcast";
import { useStore } from "@/store/translationStore";

export default function App() {
  const canvasRef = useRef<CanvasHandle>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  const { translate } = useOnlineTranslation();
  const { translatedText, latestChunk, sourceLang, targetLang } = useStore();

  const { connected, viewerCount, send } = useBroadcast("sender");
  const prevBroadcastRef = useRef("");
  useEffect(() => {
    if (!translatedText || translatedText === prevBroadcastRef.current) return;
    prevBroadcastRef.current = translatedText;
    send({ type: "translation", text: translatedText, chunk: latestChunk || undefined, sourceLang, targetLang });
  }, [translatedText, latestChunk, sourceLang, targetLang, send]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 md:px-6 py-5 space-y-5">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/[0.03] border border-white/[0.06] rounded-2xl px-5 py-4"
        >
          <LanguageSelector />
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_280px] gap-4 items-start">
          {/* Left column */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-4"
          >
            <MicrophonePanel onStream={setMicStream} translate={translate} />
            <TextVoiceOver translate={translate} />
          </motion.div>

          {/* Center — canvas */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <SubtitleCanvas ref={canvasRef} micStream={micStream} />
          </motion.div>

          {/* Right column */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col gap-4"
          >
            <ExportSidebar canvasRef={canvasRef} micStream={micStream} />
            <QRSharePanel connected={connected} viewerCount={viewerCount} />
          </motion.div>
        </div>

        <footer className="text-center text-xs text-slate-700 pb-4">
          HY Translator · Real-time Speech Translation
        </footer>
      </main>
    </div>
  );
}
