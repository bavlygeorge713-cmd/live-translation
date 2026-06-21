import { createHmac, scryptSync, timingSafeEqual } from "crypto";

const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 5 * 60 * 1000;

interface AttemptRecord {
  count: number;
  lockedUntil?: number;
}

// In-memory rate limit (per serverless instance; acceptable for a single-host login)
const ipAttempts = new Map<string, AttemptRecord>();

function verifyScrypt(password: string, stored: string): boolean {
  const colonIdx = stored.indexOf(":");
  if (colonIdx < 1) return false;
  const salt = stored.slice(0, colonIdx);
  const hash = stored.slice(colonIdx + 1);
  try {
    const derived = scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(hash, "hex");
    if (derived.length !== storedBuf.length) return false;
    return timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

export function signJwt(payload: object, secret: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]
      ?.trim() ??
    req.socket?.remoteAddress ??
    "unknown";

  const now = Date.now();
  const rec = ipAttempts.get(ip);

  if (rec?.lockedUntil) {
    if (now < rec.lockedUntil) {
      res.status(429).json({ error: "Too many failed attempts. Try again later." });
      return;
    }
    ipAttempts.delete(ip);
  }

  const body = req.body ?? {};
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    res.status(400).json({ error: "Missing credentials" });
    return;
  }

  const expectedUser = process.env.HOST_USERNAME ?? "";
  const expectedHash = process.env.HOST_PASSWORD_HASH ?? "";
  const secret = process.env.SESSION_SECRET ?? "";

  if (!expectedUser || !expectedHash || !secret) {
    console.error("login: env vars not configured");
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  // Constant-time username compare (pad both to same length to avoid length leak)
  const padLen = 256;
  const usernameOk = timingSafeEqual(
    Buffer.from(username.slice(0, padLen).padEnd(padLen)),
    Buffer.from(expectedUser.slice(0, padLen).padEnd(padLen)),
  );
  const passwordOk = verifyScrypt(password, expectedHash);

  if (!usernameOk || !passwordOk) {
    const current = ipAttempts.get(ip) ?? { count: 0 };
    current.count++;
    if (current.count >= MAX_ATTEMPTS) {
      current.lockedUntil = now + LOCKOUT_MS;
    }
    ipAttempts.set(ip, current);
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  ipAttempts.delete(ip);

  const payload = {
    sub: username,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 12 * 3600,
  };
  const token = signJwt(payload, secret);

  res.setHeader("Set-Cookie", [
    `host_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${12 * 3600}`,
  ]);
  res.status(200).json({ ok: true });
}
