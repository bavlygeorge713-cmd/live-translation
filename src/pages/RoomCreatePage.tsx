import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Clock3, LogOut, Monitor, Plus, X } from "lucide-react";
import { cx, LogoMark, RButton, RField } from "@/components/ui/redesign";
import { useAuth } from "@/contexts/AuthContext";
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
  // UI only: which dialog is open, and the logout button for the page header
  const [modal, setModal] = useState<"create" | "join" | null>(null);
  const auth = useAuth();

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
    <div className="rd-page min-h-screen bg-[#F4F7FB] text-slate-900">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <LogoMark />
        {auth && (
          <RButton variant="ghost" onClick={auth.onLogout}>
            <LogOut className="size-4" /> Log out
          </RButton>
        )}
      </header>

      <main className="mx-auto max-w-[980px] px-5 py-14 md:py-20">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-9"
        >
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[.18em] text-brand-600">
            Host console
          </div>
          <h1 className="text-[32px] font-semibold tracking-[-0.045em] text-slate-950">
            Choose a room
          </h1>
          <p className="mt-2 max-w-[560px] text-[14px] leading-6 text-slate-500">
            Start a new hall or join a room that is already running. Each room
            has its own audience, translation language and session history.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid gap-5 md:grid-cols-2"
        >
          <RoomChoice
            icon={Plus}
            title="Create a room"
            body="Start a new live translation room for a hall or session."
            action="Create room"
            onClick={() => setModal("create")}
            primary
          />
          <RoomChoice
            icon={ArrowRight}
            title="Join a room"
            body="Continue operating an existing room using its room name."
            action="Join room"
            onClick={() => setModal("join")}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-soft"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[14px] font-semibold">Recent rooms</div>
              <div className="mt-1 text-[11px] text-slate-500">
                Rooms you operated recently
              </div>
            </div>
            {recentRooms.length > 0 ? (
              <button
                onClick={handleClearAll}
                className="focus-ring rounded-lg px-2 py-1.5 text-[12px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                Clear all
              </button>
            ) : (
              <Clock3 className="size-4 text-slate-400" />
            )}
          </div>

          {recentRooms.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-[12px] text-slate-500">
              No recent rooms yet. Create a room to get started.
            </p>
          ) : (
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
                      <span className="font-mono">{room.id}</span> · Last used:{" "}
                      {formatRelativeTime(room.lastUsed)}
                    </div>
                  </div>
                  <span className="hidden text-[12px] font-semibold text-brand-600 sm:inline">
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
          )}
        </motion.div>
      </main>

      {modal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onMouseDown={() => setModal(null)}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-[480px] rounded-[20px] border border-slate-200 bg-white shadow-modal"
          >
            <div className="flex items-start justify-between border-b border-slate-200 p-6">
              <div>
                <h2 className="text-[20px] font-semibold tracking-[-.025em]">
                  {modal === "create" ? "Create room" : "Join room"}
                </h2>
                <p className="mt-1 text-[12px] text-slate-500">
                  {modal === "create"
                    ? "Name your room — viewers will connect using this name."
                    : "Enter the name of the room that is already running."}
                </p>
              </div>
              <button
                onClick={() => setModal(null)}
                aria-label="Close"
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-3 p-6">
              <RField
                ref={inputRef}
                autoFocus
                label="Room name"
                type="text"
                placeholder="Main Hall"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              {name.trim() && (
                <p className="text-[11px] text-slate-500">
                  Room ID:{" "}
                  <span className="font-mono text-slate-700">
                    {sanitizeRoomId(name.trim())}
                  </span>
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-4 px-6">
              <RButton variant="ghost" onClick={() => setModal(null)}>
                Cancel
              </RButton>
              <RButton
                variant="primary"
                onClick={handleCreate}
                disabled={!name.trim()}
              >
                {modal === "create" ? "Create room" : "Join room"}
              </RButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomChoice({
  icon: Icon,
  title,
  body,
  action,
  onClick,
  primary = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "focus-ring group min-h-[220px] rounded-[20px] border bg-white p-6 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-popover",
        primary ? "border-brand-200" : "border-slate-200",
      )}
    >
      <div
        className={cx(
          "mb-8 grid size-11 place-items-center rounded-xl",
          primary ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600",
        )}
      >
        <Icon className="size-5" />
      </div>
      <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-slate-950">
        {title}
      </h2>
      <p className="mb-5 mt-2 text-[13px] leading-5 text-slate-500">{body}</p>
      <span
        className={cx(
          "inline-flex items-center gap-2 text-[13px] font-semibold",
          primary ? "text-brand-600" : "text-slate-700",
        )}
      >
        {action}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
    </button>
  );
}
