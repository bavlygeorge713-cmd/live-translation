import { createHmac } from "crypto";

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function verifyJwt(token: string, secret: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [header, body, sig] = parts;
    const expected = createHmac("sha256", secret)
      .update(`${header}.${body}`)
      .digest("base64url");
    if (sig !== expected) return false;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return (
      typeof payload.exp === "number" &&
      payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

export default function handler(req: any, res: any) {
  const secret = process.env.SESSION_SECRET ?? "";
  if (!secret) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  const cookieHeader = (req.headers?.cookie as string | undefined) ?? "";
  const cookies = parseCookies(cookieHeader);
  const token = cookies["host_session"] ?? "";

  if (!token || !verifyJwt(token, secret)) {
    res.status(401).json({ valid: false });
    return;
  }

  res.status(200).json({ valid: true });
}
