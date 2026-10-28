import { useEffect, useRef, useCallback, useState } from "react";
import * as Ably from "ably";

type Role = "sender" | "viewer";

export interface BroadcastMessage {
  type: "translation" | "viewers" | "ping" | "config";
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
  fromPerLangChannel?: boolean;
  allowedLangs?: string[];
  maxCount?: number;
}

function sanitizeRoomParam(raw: string | undefined): string {
  const s = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 64);
  return s || "default";
}

// A config-only attachment of the room channel (server-side subscription filter). A viewer that gets its captions from a
// language channel uses it to keep receiving the host's config without also receiving every caption on the base channel.
// Ably does not support rewind on filtered channels; the host re-publishes config whenever a viewer joins.
async function attachConfigChannel(
  client: Ably.Realtime,
  channelName: string,
  onConfig: (data: BroadcastMessage) => void,
): Promise<Ably.RealtimeChannel> {
  const ch = client.channels.getDerived(channelName, {
    filter: "name == `config`",
  });
  ch.subscribe("config", (msg) => onConfig(msg.data as BroadcastMessage));
  await ch.attach();
  return ch;
}

export function useBroadcast(
  role: Role,
  onMessage?: (msg: BroadcastMessage) => void,
  roomId?: string,
  viewerLang?: string | null,
) {
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const ablyClientRef = useRef<Ably.Realtime | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [lastMessage, setLastMessage] = useState<BroadcastMessage | null>(null);
  const [requestedLangs, setRequestedLangs] = useState<Set<string>>(new Set());

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const isProd = import.meta.env.PROD;
  const sanitizedRoom = sanitizeRoomParam(roomId);

  // Keep a ref so the main effect can read the initial viewerLang at mount time
  const viewerLangRef = useRef(viewerLang ?? null);
  viewerLangRef.current = viewerLang ?? null;

  // Viewers on a language channel use the base channel for presence only (see attachConfigChannel)
  const baseLangModeRef = useRef(false);
  const configChannelRef = useRef<Ably.RealtimeChannel | null>(null);
  const modeChainRef = useRef<Promise<void>>(Promise.resolve());
  const announcedLangRef = useRef<string | null>(null); // language last announced through presence

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

    ablyClientRef.current = client;

    client.connection.on("connected", () => setConnected(true));
    client.connection.on("disconnected", () => setConnected(false));
    client.connection.on("failed", () => setConnected(false));
    client.connection.on("closed", () => setConnected(false));

    // A viewer following the host reads captions and config from the base channel; a viewer on a language channel
    // uses it for presence only. Neither needs the other viewers' presence events, only to announce itself.
    const onLangChannel = role === "viewer" && !!viewerLangRef.current;
    const channelOptions: Ably.ChannelOptions =
      role !== "viewer"
        ? {}
        : onLangChannel
          ? { modes: ["PRESENCE"] }
          : { params: { rewind: "10" }, modes: ["PRESENCE", "SUBSCRIBE"] };
    const channel = client.channels.get(channelName, channelOptions);
    baseLangModeRef.current = onLangChannel;
    channelRef.current = channel;

    if (role === "viewer") {
      channel.subscribe("translation", (msg) => {
        const data = msg.data as BroadcastMessage;
        const isHistory = Date.now() - (msg.timestamp ?? 0) > 5000;
        const fullMsg: BroadcastMessage = {
          ...data,
          isHistory: isHistory || !!data.isHistory,
        };
        onMessageRef.current?.(fullMsg);
        setLastMessage(fullMsg);
      });

      channel.subscribe("config", (msg) => {
        const data = msg.data as BroadcastMessage;
        onMessageRef.current?.(data);
        setLastMessage(data);
      });

      const enterPresence = () => {
        announcedLangRef.current = viewerLangRef.current ?? "host";
        return channel.presence
          .enter({ role: "viewer", lang: announcedLangRef.current })
          .catch(() => {});
      };

      if (onLangChannel) {
        // Attach the config channel first so the config the host re-publishes for this join cannot be missed
        attachConfigChannel(client, channelName, (data) => {
          onMessageRef.current?.(data);
          setLastMessage(data);
        })
          .then((c) => {
            configChannelRef.current = c;
          })
          .catch(() => {
            // Filtered attach failed: fall back to the full base channel so config still arrives
            baseLangModeRef.current = false;
            channel
              .setOptions({
                params: { rewind: "10" },
                modes: ["PRESENCE", "SUBSCRIBE"],
              })
              .catch(() => {});
          })
          .then(enterPresence);
      } else {
        enterPresence();
      }
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
            const langs = new Set<string>();
            for (const m of viewers) {
              const lang = (m.data as { lang?: string })?.lang;
              if (lang && lang !== "host") langs.add(lang);
            }
            setRequestedLangs(langs);
          })
          .catch(() => {});
      };

      channel.presence.subscribe(updateViewerCount);
      channel.on("attached", updateViewerCount);
    }

    return () => {
      channelRef.current = null;
      ablyClientRef.current = null;
      configChannelRef.current = null;
      channel.unsubscribe();
      channel.presence.unsubscribe();
      channel.presence.leave().catch(() => {});
      client.close();
    };
  }, [role, isProd, sanitizedRoom]);

  // ── Per-language channel subscription (viewer only) ───────────────────────
  // Re-runs when viewerLang changes; reuses the existing Ably client.
  useEffect(() => {
    if (!isProd || role !== "viewer") return;

    // Keep presence up to date when the viewer changes language
    const baseChannel = channelRef.current;
    if (baseChannel && announcedLangRef.current !== (viewerLang ?? "host")) {
      announcedLangRef.current = viewerLang ?? "host";
      baseChannel.presence
        .update({ role: "viewer", lang: announcedLangRef.current })
        .catch(() => {});
    }

    const client = ablyClientRef.current;

    // Move the base channel between "captions + config" (following the host) and "presence only" (language channel).
    // Changes are applied one at a time so quick language switches always end in the right state.
    if (client && baseChannel) {
      const wantLangMode = !!viewerLang;
      const channelName = `room:${sanitizedRoom}`;
      modeChainRef.current = modeChainRef.current
        .then(async () => {
          if (wantLangMode === baseLangModeRef.current) return;
          if (wantLangMode) {
            const c = await attachConfigChannel(client, channelName, (data) => {
              onMessageRef.current?.(data);
              setLastMessage(data);
            });
            configChannelRef.current = c;
            await baseChannel.setOptions({ modes: ["PRESENCE"] });
            baseLangModeRef.current = true;
          } else {
            await baseChannel.setOptions({
              params: { rewind: "10" },
              modes: ["PRESENCE", "SUBSCRIBE"],
            });
            baseLangModeRef.current = false;
            const c = configChannelRef.current;
            configChannelRef.current = null;
            if (c) {
              c.unsubscribe();
              c.detach().catch(() => {});
            }
          }
        })
        .catch(() => {
          /* stay on the current attachment: captions and config keep arriving */
        });
    }

    if (!viewerLang) return;
    if (!client) return;

    const perLangChannelName = `room:${sanitizedRoom}:lang:${viewerLang}`;
    const perLangChannel = client.channels.get(perLangChannelName, {
      params: { rewind: "10" },
      modes: ["SUBSCRIBE"],
    });

    perLangChannel.subscribe("translation", (msg) => {
      const data = msg.data as BroadcastMessage;
      const isHistory = Date.now() - (msg.timestamp ?? 0) > 5000;
      const fullMsg: BroadcastMessage = {
        ...data,
        isHistory: isHistory || !!data.isHistory,
        fromPerLangChannel: true,
      };
      onMessageRef.current?.(fullMsg);
      setLastMessage(fullMsg);
    });

    return () => {
      perLangChannel.unsubscribe();
    };
  }, [isProd, role, sanitizedRoom, viewerLang]);

  const send = useCallback(
    (msg: BroadcastMessage) => {
      if (isProd) {
        const channel = channelRef.current;
        if (channel && role === "sender") {
          const eventName = msg.type === "config" ? "config" : "translation";
          channel.publish(eventName, msg).catch(() => {});
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

  const publishToLang = useCallback(
    (langCode: string, msg: BroadcastMessage) => {
      if (!isProd) return;
      const client = ablyClientRef.current;
      if (!client) return;
      client.channels
        .get(`room:${sanitizedRoom}:lang:${langCode}`)
        .publish("translation", msg)
        .catch(() => {});
    },
    [isProd, sanitizedRoom],
  );

  return {
    connected,
    viewerCount,
    lastMessage,
    send,
    requestedLangs,
    publishToLang,
  };
}
