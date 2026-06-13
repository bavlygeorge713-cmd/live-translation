import { useEffect, useRef, useCallback, useState } from "react";
import * as Ably from "ably";

type Role = "sender" | "viewer";

export interface BroadcastMessage {
  type: "translation" | "viewers" | "ping";
  text?: string;
  chunk?: string;
  interimChunk?: string;
  transcript?: string;
  interimTranscript?: string;
  sourceLang?: string;
  targetLang?: string;
  isFinal?: boolean;
  isHistory?: boolean;
  batchId?: string;
  count?: number;
  seq?: number;
  seqId?: number;
  refined?: boolean;
  ts?: number;
}

function sanitizeRoomParam(raw: string | undefined): string {
  const s = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 64);
  return s || "default";
}

export function useBroadcast(
  role: Role,
  onMessage?: (msg: BroadcastMessage) => void,
  roomId?: string,
) {
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [lastMessage, setLastMessage] = useState<BroadcastMessage | null>(null);

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const isProd = import.meta.env.PROD;
  const sanitizedRoom = sanitizeRoomParam(roomId);

  useEffect(() => {
    if (!isProd) {
      // ── Dev: WebSocket relay ──────────────────────────────────────────────
      const relayBase = import.meta.env.VITE_RELAY_URL as string | undefined;
      const wsUrl = relayBase
        ? `${relayBase.startsWith("https") ? "wss" : "ws"}://${relayBase.replace(/^https?:\/\//, "").replace(/\/$/, "")}/ws/translation?role=${role}`
        : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/translation?role=${role}`;
      let ws: WebSocket;
      let dead = false;
      let retryTimer: ReturnType<typeof setTimeout>;

      function connect() {
        if (dead) return;
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => setConnected(true);
        ws.onclose = () => {
          setConnected(false);
          if (!dead) retryTimer = setTimeout(connect, 3000);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (e) => {
          try {
            const msg: BroadcastMessage = JSON.parse(e.data as string);
            if (msg.type === "viewers") {
              setViewerCount(msg.count ?? 0);
            } else {
              onMessageRef.current?.(msg);
              setLastMessage(msg);
            }
          } catch {
            /* ignore */
          }
        };
      }

      connect();
      return () => {
        dead = true;
        clearTimeout(retryTimer);
        ws?.close();
      };
    }

    // ── Production: Ably transport ────────────────────────────────────────
    const channelName = `room:${sanitizedRoom}`;
    const clientId = `user-${Math.random().toString(36).slice(2, 11)}`;

    const client = new Ably.Realtime({
      authUrl: `/api/ably-token?room=${encodeURIComponent(sanitizedRoom)}`,
      authMethod: "GET",
      clientId,
    });

    client.connection.on("connected", () => setConnected(true));
    client.connection.on("disconnected", () => setConnected(false));
    client.connection.on("failed", () => setConnected(false));
    client.connection.on("closed", () => setConnected(false));

    const channelOptions: Ably.ChannelOptions =
      role === "viewer" ? { params: { rewind: "10" } } : {};
    const channel = client.channels.get(channelName, channelOptions);
    channelRef.current = channel;

    if (role === "viewer") {
      channel.subscribe("translation", (msg) => {
        const data = msg.data as BroadcastMessage;
        // Rewound messages have a past publish timestamp; 5s threshold is safe
        const isHistory = Date.now() - (msg.timestamp ?? 0) > 5000;
        const fullMsg: BroadcastMessage = {
          ...data,
          isHistory: isHistory || !!data.isHistory,
        };
        onMessageRef.current?.(fullMsg);
        setLastMessage(fullMsg);
      });

      channel.presence.enter({ role: "viewer" }).catch(() => {});
    } else {
      // Host/sender
      channel.presence.enter({ role: "host" }).catch(() => {});

      const updateViewerCount = () => {
        channel.presence
          .get()
          .then((members) => {
            const viewers = members.filter(
              (m) => (m.data as { role?: string })?.role !== "host",
            );
            setViewerCount(viewers.length);
          })
          .catch(() => {});
      };

      channel.presence.subscribe(updateViewerCount);
      channel.on("attached", updateViewerCount);
    }

    return () => {
      channelRef.current = null;
      channel.unsubscribe();
      channel.presence.unsubscribe();
      channel.presence.leave().catch(() => {});
      client.close();
    };
  }, [role, isProd, sanitizedRoom]);

  const send = useCallback(
    (msg: BroadcastMessage) => {
      if (isProd) {
        const channel = channelRef.current;
        if (channel && role === "sender") {
          channel.publish("translation", msg).catch(() => {});
        }
        return;
      }
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    [role, isProd],
  );

  return { connected, viewerCount, lastMessage, send };
}
