export function sanitizeRoomId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "default"
  );
}

export function roomIdToDisplayName(id: string): string {
  return id
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function hashRoom(roomId: string): 0 | 1 {
  let h = 0;
  for (let i = 0; i < roomId.length; i++) {
    h = (h * 31 + roomId.charCodeAt(i)) >>> 0;
  }
  return (h % 2) as 0 | 1;
}

export interface RecentRoom {
  id: string;
  name: string;
  lastUsed: number;
}

const RECENT_ROOMS_KEY = "ct_recent_rooms";
const MAX_RECENT = 5;

export function getRecentRooms(): RecentRoom[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_ROOMS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveRecentRoom(id: string, name: string): void {
  const rooms = getRecentRooms().filter((r) => r.id !== id);
  rooms.unshift({ id, name, lastUsed: Date.now() });
  localStorage.setItem(
    RECENT_ROOMS_KEY,
    JSON.stringify(rooms.slice(0, MAX_RECENT)),
  );
}

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function deleteRecentRoom(id: string): RecentRoom[] {
  const rooms = getRecentRooms().filter((r) => r.id !== id);
  localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(rooms));
  return rooms;
}

export function clearRecentRooms(): void {
  localStorage.removeItem(RECENT_ROOMS_KEY);
}
