import * as Ably from "ably";
import { isHostSession } from "./_hostAuth.js";

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
    // Only a signed-in host (valid host_session cookie) may publish. Viewers get subscribe + presence
    // (presence so the host can see viewer count and requested languages).
    const isHost = await isHostSession(req.headers?.cookie);
    const capability: Record<string, Ably.CapabilityOp[]> = isHost
      ? {
          [channelName]: ["subscribe", "publish", "presence"],
          [`${channelName}:lang:*`]: ["subscribe", "publish"],
        }
      : {
          [channelName]: ["subscribe", "presence"],
          [`${channelName}:lang:*`]: ["subscribe"],
        };
    const client = new Ably.Rest(apiKey);
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: "*",
      capability,
      ttl: 3600 * 1000,
    });
    // The answer depends on the session cookie, so it must never be cached or shared.
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Cookie");
    res.status(200).json(tokenRequest);
  } catch (err: any) {
    console.error("ably-token error:", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Server error" });
  }
}
