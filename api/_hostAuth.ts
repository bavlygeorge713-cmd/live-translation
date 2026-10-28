// Host-session check shared by the API functions (underscore prefix: not exposed as an endpoint).
// /api/login sets an HS256 JWT in the `host_session` cookie; this verifies that same token.
// WebCrypto only, so it works in both the Node and the Edge runtime.

const enc = new TextEncoder();

function cookieValue(header: string, name: string): string {
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    if (pair.slice(0, eq).trim() === name) return pair.slice(eq + 1).trim();
  }
  return "";
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function isHostSession(
  cookieHeader: string | null | undefined,
): Promise<boolean> {
  const secret = process.env.SESSION_SECRET ?? "";
  if (!secret) return false;
  const parts = cookieValue(cookieHeader ?? "", "host_session").split(".");
  if (parts.length !== 3) return false;
  const [header, body, sig] = parts;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sig),
      enc.encode(`${header}.${body}`),
    );
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    return (
      typeof payload.exp === "number" &&
      payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
