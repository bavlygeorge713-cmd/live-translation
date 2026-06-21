export default function handler(_req: any, res: any) {
  res.setHeader("Set-Cookie", [
    "host_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
  ]);
  res.status(200).json({ ok: true });
}
