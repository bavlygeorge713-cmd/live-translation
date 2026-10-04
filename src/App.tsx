import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import { SectionLabel } from "@/components/ui/redesign";
import { Header } from "@/components/Header";
import { LanguageSelector } from "@/components/LanguageSelector";
import { MicrophonePanel } from "@/components/MicrophonePanel";
import { SubtitleCanvas, CanvasHandle } from "@/components/SubtitleCanvas";
import { TextVoiceOver } from "@/components/TextVoiceOver";
import { ExportSidebar } from "@/components/ExportSidebar";
import { QRSharePanel } from "@/components/QRSharePanel";
import { AllowedLangsPanel } from "@/components/AllowedLangsPanel";
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
  const { connected, viewerCount, send, requestedLangs, publishToLang } =
    useBroadcast("sender", undefined, roomId);

  const roomName = roomId ? roomIdToDisplayName(roomId) : undefined;

  return (
    <div className="rd-page flex min-h-screen flex-col bg-[var(--app)] text-primary">
      <Header roomName={roomName} />

      <main className="mx-auto w-full max-w-[1900px] flex-1 p-4 xl:p-5 2xl:p-6">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_320px] xl:gap-5">
          {/* Left column */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-app bg-[var(--surface)] p-5 shadow-soft"
            >
              <SectionLabel>Room</SectionLabel>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold text-primary">
                    {roomName ?? "Conference Translator"}
                  </div>
                  <div className="mt-1 truncate font-mono text-[12px] text-tertiary">
                    {roomId}
                  </div>
                </div>
                {connected ? (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200/80">
                    Live
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                    Offline
                  </span>
                )}
              </div>
              <div className="mb-5 flex items-center justify-between rounded-xl border border-app bg-[var(--surface-2)] p-3.5">
                <div className="flex items-center gap-2 text-[12px] font-medium text-secondary">
                  <Users className="size-4" /> Audience
                </div>
                <span className="text-[13px] font-semibold text-primary">
                  {viewerCount}
                </span>
              </div>

              <SectionLabel>Translation</SectionLabel>
              <LanguageSelector />
            </motion.div>

            <MicrophonePanel
              onStream={setMicStream}
              send={send}
              roomId={roomId}
              requestedLangs={requestedLangs}
              publishToLang={publishToLang}
            />
            <TextVoiceOver translate={translate} />
          </motion.div>

          {/* Center — canvas (first on mobile so captions stay in view) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="order-first min-w-0 lg:order-none"
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
            className="flex flex-col gap-4 lg:col-span-2 xl:col-span-1"
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
            <AllowedLangsPanel send={send} viewerCount={viewerCount} />
          </motion.div>
        </div>

        <footer className="pb-2 pt-6 text-center text-[11px] text-tertiary">
          {roomName
            ? `${roomName} · Conference Translator · Real-time Speech Translation`
            : "Conference Translator · Real-time Speech Translation"}
        </footer>
      </main>
    </div>
  );
}
