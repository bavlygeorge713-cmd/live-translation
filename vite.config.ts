import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import os from "os";
import type { Plugin } from "vite";
import { WebSocketServer, WebSocket } from "ws";

function translationRelayPlugin(): Plugin {
  return {
    name: "translation-relay",
    configureServer(server) {
      // ── /api/network-info ─────────────────────────────────────────────────
      server.middlewares.use("/api/network-info", (_req, res) => {
        const ifaces = os.networkInterfaces();
        const ips: string[] = [];
        for (const addrs of Object.values(ifaces)) {
          for (const a of addrs ?? []) {
            if (a.family === "IPv4" && !a.internal) ips.push(a.address);
          }
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({ ips }));
      });

      // ── WebSocket relay at /ws/translation ────────────────────────────────
      const wss = new WebSocketServer({ noServer: true });
      const viewers = new Set<WebSocket>();
      let sender: WebSocket | null = null;
      let lastTranslationMsg: string | null = null; // cached for late-joining viewers

      const broadcastViewerCount = () => {
        if (sender?.readyState === WebSocket.OPEN) {
          sender.send(JSON.stringify({ type: "viewers", count: viewers.size }));
        }
      };

      wss.on("connection", (ws, req) => {
        const params = new URLSearchParams(
          (req.url ?? "").replace(/^[^?]*/, "")
        );
        const role = params.get("role");

        if (role === "sender") {
          sender = ws;
          broadcastViewerCount();
          ws.on("message", (data) => {
            const raw = data.toString();
            // Cache latest translation so new viewers get it immediately on join
            try {
              const parsed = JSON.parse(raw);
              if (parsed.type === "translation") lastTranslationMsg = raw;
            } catch { /* ignore */ }
            for (const v of viewers) {
              if (v.readyState === WebSocket.OPEN) v.send(raw);
            }
          });
          ws.on("close", () => { sender = null; });
        } else {
          viewers.add(ws);
          // Send the latest cached translation immediately so viewer isn't blank
          if (lastTranslationMsg && ws.readyState === WebSocket.OPEN) {
            ws.send(lastTranslationMsg);
          }
          broadcastViewerCount();
          ws.on("close", () => {
            viewers.delete(ws);
            broadcastViewerCount();
          });
        }
      });

      server.httpServer?.on("upgrade", (req, socket, head) => {
        if (req.url?.startsWith("/ws/translation")) {
          wss.handleUpgrade(req, socket as any, head, (ws) => {
            wss.emit("connection", ws, req);
          });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), translationRelayPlugin()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  optimizeDeps: {
    exclude: ["@xenova/transformers"],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "esnext",
  },
  server: {
    host: true,
    allowedHosts: true,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
