import { useEffect, useRef, useCallback, useState } from "react";

type Role = "sender" | "viewer";

interface BroadcastMessage {
  type: "translation" | "viewers";
  text?: string;
  chunk?: string;
  sourceLang?: string;
  targetLang?: string;
  count?: number;
}

export function useBroadcast(role: Role) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [lastMessage, setLastMessage] = useState<BroadcastMessage | null>(null);

  useEffect(() => {
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
          const msg: BroadcastMessage = JSON.parse(e.data);
          if (msg.type === "viewers") setViewerCount(msg.count ?? 0);
          else setLastMessage(msg);
        } catch { /* ignore */ }
      };
    }

    connect();
    return () => {
      dead = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [role]);

  const send = useCallback((msg: BroadcastMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { connected, viewerCount, lastMessage, send };
}
