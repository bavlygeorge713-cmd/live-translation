import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import {
  HostChrome,
  DrawerRoomCard,
  DrawerAccountCard,
  SlotHost,
  createSlot,
} from "@/components/HostDrawer";
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

// Host shell theme (visual only) — defaults to dark
const HOST_THEME_KEY = "ct_host_theme";
type HostTheme = "dark" | "light";
function readHostTheme(): HostTheme {
  try {
    return localStorage.getItem(HOST_THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function App({ roomId }: AppProps) {
  const canvasRef = useRef<CanvasHandle>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [recIsRecording, setRecIsRecording] = useState(false);
  const [recDuration, setRecDuration] = useState(0);
  const [theme, setTheme] = useState<HostTheme>(readHostTheme);
  const isDark = theme === "dark";

  const toggleTheme = () => {
    const next: HostTheme = isDark ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(HOST_THEME_KEY, next);
    } catch {
      /* storage unavailable — theme just won't persist */
    }
  };

  // MicrophonePanel renders into these two elements (top bar / menu drawer). Created once, attached once, never replaced.
  const [toolbarSlot] = useState(createSlot);
  const [drawerSlot] = useState(createSlot);

  const { translate } = useOnlineTranslation(roomId);
  const { connected, viewerCount, send, requestedLangs, publishToLang } =
    useBroadcast("sender", undefined, roomId);

  const roomName = roomId ? roomIdToDisplayName(roomId) : undefined;

  return (
    <div
      className={`rd-page ${isDark ? "dark dark-shell host-dark" : ""} flex min-h-screen flex-col bg-[var(--app)] text-primary`}
    >
      <HostChrome
        roomName={roomName}
        connected={connected}
        bar={
          <>
            <LanguageSelector
              compact
              className="min-w-[8rem] flex-[1_1_8rem] xl:max-w-[13rem]"
            />
            <div className="order-[-7] flex h-9 shrink-0 items-center gap-3 rounded-[10px] border border-app bg-[var(--surface-2)] px-3 xl:order-none">
              <div className="flex items-center gap-2 text-[12px] font-medium text-secondary">
                <Users className="size-4" /> Audience
              </div>
              <span className="text-[13px] font-semibold tabular-nums text-primary">
                {viewerCount}
              </span>
            </div>
            {/* MicrophonePanel: audio input, input language, live controls */}
            <SlotHost slot={toolbarSlot} />
          </>
        }
      >
        <DrawerRoomCard roomName={roomName} roomId={roomId} />
        <AllowedLangsPanel send={send} viewerCount={viewerCount} />
        {/* MicrophonePanel: recognition, quality, AI voice, level meter */}
        <SlotHost slot={drawerSlot} />
        <ExportSidebar
          canvasRef={canvasRef}
          micStream={micStream}
          onRecordingChange={(isRec, dur) => {
            setRecIsRecording(isRec);
            setRecDuration(dur);
          }}
        />
        <TextVoiceOver translate={translate} />
        <DrawerAccountCard isDark={isDark} onToggleTheme={toggleTheme} />
      </HostChrome>

      {/* Renders nothing of its own: its controls appear in the two slots above */}
      <MicrophonePanel
        onStream={setMicStream}
        send={send}
        roomId={roomId}
        requestedLangs={requestedLangs}
        publishToLang={publishToLang}
        toolbarSlot={toolbarSlot}
        drawerSlot={drawerSlot}
      />

      <main className="mx-auto w-full max-w-[1900px] flex-1 p-4 xl:p-5 2xl:p-6">
        {/* The caption canvas stays centred (the drawer overlays it, so it never changes size). From xl up the share panel takes the
            right-hand gutter, the left one stays empty; below xl it sits under the canvas. It is outside the canvas div that gets recorded. */}
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(20rem,1fr)_minmax(0,1100px)_minmax(20rem,1fr)]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mx-auto w-full min-w-0 max-w-[1100px] xl:col-start-2 xl:row-start-1"
          >
            <SubtitleCanvas
              ref={canvasRef}
              micStream={micStream}
              isRecording={recIsRecording}
              recDuration={recDuration}
            />
          </motion.div>
          <div className="mx-auto w-full max-w-[20rem] xl:col-start-3 xl:row-start-1 xl:mx-0">
            <QRSharePanel connected={connected} viewerCount={viewerCount} />
          </div>
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
