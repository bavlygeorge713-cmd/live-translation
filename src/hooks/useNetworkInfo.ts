import { useEffect, useState } from "react";

export function useNetworkInfo() {
  const isProd = import.meta.env.PROD;
  const [ips, setIps] = useState<string[]>([]);

  useEffect(() => {
    if (isProd) return;
    fetch("/api/network-info")
      .then((r) => r.json())
      .then((data) => setIps(data.ips ?? []))
      .catch(() => setIps([]));
  }, [isProd]);

  if (isProd) {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get("room");
    const viewerBase = `${window.location.origin}/viewer`;
    const viewerUrl = roomId ? `${viewerBase}?room=${roomId}` : viewerBase;
    return { ips: [], viewerUrls: [viewerUrl] };
  }

  const port = window.location.port || "5173";
  const viewerUrls = ips.map((ip) => `http://${ip}:${port}/viewer`);
  return { ips, viewerUrls };
}
