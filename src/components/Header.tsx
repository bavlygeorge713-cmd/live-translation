import { ReactNode, RefObject } from "react";
import { motion } from "framer-motion";
import { Menu } from "lucide-react";
import { LogoMark } from "@/components/ui/redesign";
import { Badge } from "@/components/ui/Badge";
import { useStore } from "@/store/translationStore";

interface HeaderProps {
  roomName?: string;
  connected: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  menuButtonRef: RefObject<HTMLButtonElement>;
  drawerId: string;
  /** The control strip that sits between the room title and the menu button (see App). */
  children?: ReactNode;
}

export function Header({
  roomName,
  connected,
  menuOpen,
  onToggleMenu,
  menuButtonRef,
  drawerId,
  children,
}: HeaderProps) {
  const { processingState } = useStore();

  // Layout is CSS only (flex order + wrap). From xl up everything sits in one row: title, audio input, input language, output
  // language, audience, live controls, menu button. Below xl the first row holds title, audience, live controls and menu button, and
  // a full-width break puts the three selectors on a second row. Order values (below xl / from xl): title -8/-3, audience -7/0,
  // live controls -6/1, menu button -5/2, break -4, audio input -3/-2, input language -2/-1, output language 0, banners last.
  // The orders are set where each element lives (App, MicrophonePanel).
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-app bg-[var(--surface)]"
    >
      <div className="mx-auto flex max-w-[1900px] flex-wrap items-end gap-x-3 gap-y-2.5 px-4 py-2.5 sm:px-6">
        {/* Room title + connection / processing status */}
        <div className="order-[-8] flex min-w-0 flex-1 items-center gap-3 self-center xl:order-[-3] xl:w-56 xl:flex-none">
          <LogoMark compact />
          <div className="min-w-0 flex-1 leading-none">
            <span className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-primary">
              {roomName ? `${roomName} — Host` : "Conference Translator"}
            </span>
            <div className="mt-1.5 flex h-[22px] items-center gap-1.5 overflow-hidden">
              {connected ? (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/30">
                  Live
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 ring-1 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:ring-slate-600">
                  Offline
                </span>
              )}
              {processingState === "transcribing" && (
                <Badge variant="blue" dot>
                  Transcribing…
                </Badge>
              )}
              {processingState === "translating" && (
                <Badge variant="purple" dot>
                  Translating…
                </Badge>
              )}
              {processingState === "speaking" && (
                <Badge variant="emerald" dot>
                  Speaking…
                </Badge>
              )}
            </div>
          </div>
        </div>

        {children}

        <button
          ref={menuButtonRef}
          type="button"
          onClick={onToggleMenu}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          title={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls={drawerId}
          className="focus-ring order-[-5] grid size-9 shrink-0 place-items-center rounded-[10px] border border-app bg-[var(--surface)] text-secondary transition-colors hover:bg-[var(--surface-2)] hover:text-primary xl:order-2"
        >
          <Menu className="size-[18px]" />
        </button>

        <div aria-hidden="true" className="order-[-4] h-0 basis-full xl:hidden" />
      </div>
    </motion.header>
  );
}
