import { motion } from "framer-motion";
import { Globe, LogOut, Moon, Sun } from "lucide-react";
import { LogoMark, RButton } from "@/components/ui/redesign";
import { Badge } from "@/components/ui/Badge";
import { useStore } from "@/store/translationStore";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  roomName?: string;
  isDark: boolean;
  onToggleTheme: () => void;
}

export function Header({ roomName, isDark, onToggleTheme }: HeaderProps) {
  const { processingState } = useStore();
  const auth = useAuth();

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-40 border-b border-app bg-[var(--surface)]"
    >
      <div className="mx-auto flex h-16 max-w-[1900px] items-center justify-between gap-4 px-4 sm:px-6">
        {/* Left — logo + room name */}
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark compact />
          <div className="min-w-0 leading-none">
            <span className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-primary">
              {roomName ? `${roomName} — Host` : "Conference Translator"}
            </span>
            <p className="mt-1 truncate text-[10px] font-medium uppercase tracking-[0.16em] text-tertiary">
              Real-time Speech Translation
            </p>
          </div>
        </div>

        {/* Center — processing state badges */}
        <div className="flex items-center gap-2">
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

        {/* Right — Web Speech label + logout button */}
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1.5 text-[12px] text-tertiary lg:flex">
            <Globe className="size-3.5 shrink-0" />
            <span className="whitespace-nowrap">
              Web Speech · Online Translation
            </span>
          </div>

          <RButton
            variant="ghost"
            size="sm"
            onClick={onToggleTheme}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            className="w-9 !px-0"
          >
            {isDark ? (
              <Sun className="size-4 shrink-0" />
            ) : (
              <Moon className="size-4 shrink-0" />
            )}
          </RButton>

          {auth && (
            <RButton variant="ghost" onClick={auth.onLogout} title="Log out">
              <LogOut className="size-4 shrink-0" />
              <span className="hidden sm:inline">Log out</span>
            </RButton>
          )}
        </div>
      </div>
    </motion.header>
  );
}
