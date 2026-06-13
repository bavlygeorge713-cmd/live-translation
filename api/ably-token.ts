import * as Ably from "ably";

function sanitizeRoomParam(raw: unknown): string {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 64);
  return s || "default";
}

export default async function handler(req: any, res: any) {
  const roomId = sanitizeRoomParam(req.query?.room);
  const channelName = `room:${roomId}`;

  const apiKey = (process.env.ABLY_API_KEY ?? "").replace(/^﻿/, "").trim();
  if (!apiKey) {
    res.status(500).json({ error: "ABLY_API_KEY not configured" });
    return;
  }

  try {
    const client = new Ably.Rest(apiKey);
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: "*",
      capability: { [channelName]: ["subscribe", "publish", "presence"] },
      ttl: 3600 * 1000,
    });
    res.status(200).json(tokenRequest);
  } catch (err: any) {
    console.error("ably-token error:", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
}
