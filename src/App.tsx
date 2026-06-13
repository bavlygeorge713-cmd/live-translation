import { useRef, useState } from "react";
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
import { roomIdToDisplayName } from "@/lib/roomUtils";

interface AppProps {
  roomId: string;
}

export default function App({ roomId }: AppProps) {
  const canvasRef = useRef<CanvasHandle>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [recIsRecording, setRecIsRecording] = useState(false);
  const [recDuration, setRecDuration] = useState(0);

  const { translate } = useOnlineTranslation(roomId);
  const { connected, viewerCount, send } = useBroadcast(
    "sender",
    undefined,
    roomId,
  );

  const roomName = roomId ? roomIdToDisplayName(roomId) : undefined;

  return (
    <div className="min-h-screen flex flex-col">
      <Header roomName={roomName} />

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
            <MicrophonePanel
              onStream={setMicStream}
              send={send}
              roomId={roomId}
            />
            <TextVoiceOver translate={translate} />
          </motion.div>

          {/* Center — canvas */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <SubtitleCanvas
              ref={canvasRef}
              micStream={micStream}
              isRecording={recIsRecording}
              recDuration={recDuration}
            />
          </motion.div>

          {/* Right column */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col gap-4"
          >
            <ExportSidebar
              canvasRef={canvasRef}
              micStream={micStream}
              onRecordingChange={(isRec, dur) => {
                setRecIsRecording(isRec);
                setRecDuration(dur);
              }}
            />
            <QRSharePanel connected={connected} viewerCount={viewerCount} />
          </motion.div>
        </div>

        <footer className="text-center text-xs text-slate-700 pb-4">
          {roomName
            ? `${roomName} · Conference Translator · Real-time Speech Translation`
            : "Conference Translator · Real-time Speech Translation"}
        </footer>
      </main>
    </div>
  );
}
