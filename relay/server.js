const { WebSocketServer, WebSocket } = require("ws");
const http = require("http");

const server = http.createServer((_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.writeHead(200);
  res.end("HY Translator Relay — OK");
});

const wss = new WebSocketServer({ noServer: true });
const viewers = new Set();
let sender = null;
let lastTranslationMsg = null;

const broadcastViewerCount = () => {
  if (sender?.readyState === WebSocket.OPEN) {
    sender.send(JSON.stringify({ type: "viewers", count: viewers.size }));
  }
};

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const role = url.searchParams.get("role");

  if (role === "sender") {
    sender = ws;
    broadcastViewerCount();
    ws.on("message", (data) => {
      const raw = data.toString();
      try {
        const parsed = JSON.parse(raw);
        if (parsed.type === "translation") lastTranslationMsg = raw;
      } catch {}
      for (const v of viewers) {
        if (v.readyState === WebSocket.OPEN) v.send(raw);
      }
    });
    ws.on("close", () => { sender = null; });
  } else {
    viewers.add(ws);
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

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`HY Translator relay running on port ${PORT}`);
});
