import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic2, Plus, X } from "lucide-react";
import {
  clearRecentRooms,
  deleteRecentRoom,
  formatRelativeTime,
  getRecentRooms,
  RecentRoom,
  sanitizeRoomId,
  saveRecentRoom,
} from "@/lib/roomUtils";

export function RoomCreatePage() {
  const [name, setName] = useState("");
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentRooms(getRecentRooms());
    inputRef.current?.focus();
  }, []);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = sanitizeRoomId(trimmed);
    saveRecentRoom(id, trimmed);
    window.location.href = `/?room=${id}`;
  };

  const handleRejoin = (room: RecentRoom) => {
    saveRecentRoom(room.id, room.name);
    window.location.href = `/?room=${room.id}`;
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
    <div className="min-h-screen bg-[#08080f] flex items-center justify-center text-white px-4 py-10">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8"
        >
          <div className="size-10 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 flex items-center justify-center">
            <Mic2 className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
              Conference Translator
            </h1>
            <p className="text-xs text-slate-500">Host Setup</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-200">
            Create a Room
          </h2>
          <p className="text-xs text-slate-500">
            Name your room — viewers will connect using this name.
          </p>
          <input
            ref={inputRef}
            type="text"
            placeholder="Room Name (e.g. Main Hall)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="w-full bg-white/5 border border-white/10 text-slate-200 rounded-xl px-4 py-3
              text-sm outline-none focus:border-blue-500/50 transition-colors placeholder-slate-600"
          />
          {name.trim() && (
            <p className="text-[11px] text-slate-600">
              Room ID:{" "}
              <span className="text-slate-400 font-mono">
                {sanitizeRoomId(name.trim())}
              </span>
            </p>
          )}
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500
              disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium
              rounded-xl py-3 text-sm transition-colors"
          >
            <Plus className="size-4" />
            Create Room &amp; Start
          </button>
        </motion.div>

        {recentRooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="mt-6 space-y-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Recent Rooms
              </p>
              <button
                onClick={handleClearAll}
                className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
              >
                Clear all
              </button>
            </div>
            {recentRooms.map((room) => (
              <div
                key={room.id}
                className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06]
                  rounded-xl px-4 py-3"
              >
                <div>
                  <p className="text-sm text-slate-200 font-medium">
                    {room.name}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5 font-mono">
                    {room.id}
                  </p>
                  <p className="text-[10px] text-slate-700 mt-0.5">
                    Last used: {formatRelativeTime(room.lastUsed)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button
                    onClick={() => handleRejoin(room)}
                    className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30
                      hover:border-blue-400/50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Rejoin
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, room.id)}
                    className="p-1 text-slate-600 hover:text-red-400 rounded transition-colors"
                    aria-label="Remove room"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
