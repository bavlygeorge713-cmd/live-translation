import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Monitor, Smartphone, X } from "lucide-react";
import { LogoMark, RButton, RField } from "@/components/ui/redesign";
import {
  clearRecentRooms,
  deleteRecentRoom,
  formatRelativeTime,
  getRecentRooms,
  RecentRoom,
  sanitizeRoomId,
  saveRecentRoom,
} from "@/lib/roomUtils";

export function RoomJoinPage() {
  const [name, setName] = useState("");
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentRooms(getRecentRooms());
    inputRef.current?.focus();
  }, []);

  const handleJoin = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = sanitizeRoomId(trimmed);
    saveRecentRoom(id, trimmed);
    window.location.href = `/viewer?room=${id}`;
  };

  const handleRejoin = (room: RecentRoom) => {
    saveRecentRoom(room.id, room.name);
    window.location.href = `/viewer?room=${room.id}`;
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRecentRooms(deleteRecentRoom(id));
  };

  const handleClearAll = () => {
    clearRecentRooms();
    setRecentRooms([]);
  };

  return (
    <div className="rd-page relative min-h-screen overflow-hidden bg-[#F4F7FB] px-5 py-8 text-slate-900">
      <div className="pointer-events-none absolute left-1/2 top-[-220px] size-[520px] -translate-x-1/2 rounded-full bg-brand-100/70 blur-3xl" />
      <div className="relative mx-auto flex min-h-[calc(100vh-64px)] max-w-[460px] flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,.08)] sm:p-7"
        >
          <div className="mb-7 flex justify-center">
            <LogoMark />
          </div>
          <div className="mb-6 text-center">
            <h1 className="text-[24px] font-semibold tracking-[-.035em] text-slate-950">
              Join a room
            </h1>
            <p className="mt-1.5 text-[12px] leading-5 text-slate-500">
              Ask the host for the room name, or scan their QR code to join
              automatically.
            </p>
          </div>

          <div className="space-y-3">
            <RField
              ref={inputRef}
              label="Room name"
              type="text"
              placeholder="Main Hall"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            {name.trim() && (
              <p className="text-[11px] text-slate-500">
                Room ID:{" "}
                <span className="font-mono text-slate-700">
                  {sanitizeRoomId(name.trim())}
                </span>
              </p>
            )}
            <RButton
              variant="primary"
              size="lg"
              className="w-full"
              onClick={handleJoin}
              disabled={!name.trim()}
            >
              Join live translation <ArrowRight className="size-4" />
            </RButton>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-medium text-slate-400">
            <Smartphone className="size-3.5" /> No app installation required
          </div>
        </motion.div>

        {recentRooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-5 w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[14px] font-semibold">Recently joined</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Rooms you joined on this device
                </div>
              </div>
              <button
                onClick={handleClearAll}
                className="focus-ring rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                Clear all
              </button>
            </div>
            <div className="space-y-2">
              {recentRooms.map((room) => (
                <div
                  key={room.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRejoin(room)}
                  onKeyDown={(e) => e.key === "Enter" && handleRejoin(room)}
                  className="focus-ring flex w-full cursor-pointer items-center gap-4 rounded-xl border border-slate-200 p-3.5 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                    <Monitor className="size-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">
                      {room.name}
                    </div>
                    <div className="mt-1 truncate text-[11px] text-slate-500">
                      <span className="font-mono">{room.id}</span> ·{" "}
                      {formatRelativeTime(room.lastUsed)}
                    </div>
                  </div>
                  <span className="text-[12px] font-semibold text-brand-600">
                    Rejoin
                  </span>
                  <button
                    onClick={(e) => handleDelete(e, room.id)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Remove room"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
