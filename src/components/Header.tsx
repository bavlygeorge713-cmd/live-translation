import { motion } from "framer-motion";
import { Mic2, Globe, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useStore } from "@/store/translationStore";
import { useAuth } from "@/contexts/AuthContext";

interface HeaderProps {
  roomName?: string;
}

export function Header({ roomName }: HeaderProps) {
  const { processingState } = useStore();
  const auth = useAuth();

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-40 bg-[rgba(13,13,15,0.85)] backdrop-blur-xl border-b border-white/[0.06]"
    >
      <div className="max-w-[1500px] mx-auto px-6 h-14 flex items-center justify-between gap-4">
        {/* Left — logo + room name */}
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="size-8 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center shrink-0">
            <Mic2 className="size-4 text-white" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent truncate block">
              {roomName ? `${roomName} — Host` : "Conference Translator"}
            </span>
            <p className="text-[10px] text-slate-600 -mt-0.5">
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
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Globe className="size-3.5 shrink-0" />
            <span className="whitespace-nowrap">Web Speech · Online Translation</span>
          </div>

          {auth && (
            <button
              onClick={auth.onLogout}
              title="Log out"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full
                bg-white/5 border border-white/10 text-slate-500 whitespace-nowrap
                hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400 transition-colors"
            >
              <LogOut className="size-3 shrink-0" />
              <span>Log out</span>
            </button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
