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

  // In production use the deployed URL directly
  if (isProd) {
    return { ips: [], viewerUrls: [`${window.location.origin}/viewer`] };
  }

  const port = window.location.port || "5173";
  const viewerUrls = ips.map((ip) => `http://${ip}:${port}/viewer`);
  return { ips, viewerUrls };
}
