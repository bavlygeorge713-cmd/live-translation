import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  QrCode,
  Wifi,
  WifiOff,
  Users,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Download,
} from "lucide-react";
import QRCode from "qrcode";
import { useNetworkInfo } from "@/hooks/useNetworkInfo";
import { GlassCard } from "@/components/ui/GlassCard";

interface Props {
  connected: boolean;
  viewerCount: number;
}

export function QRSharePanel({ connected, viewerCount }: Props) {
  const { viewerUrls } = useNetworkInfo();

  const [expanded, setExpanded] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const qrImgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (viewerUrls.length > 0 && !selectedUrl) {
      setSelectedUrl(viewerUrls[0]);
    }
  }, [viewerUrls, selectedUrl]);

  useEffect(() => {
    if (!selectedUrl) return;
    QRCode.toDataURL(selectedUrl, {
      width: 200,
      margin: 2,
      color: { dark: "#e2e8f0", light: "#0f0f1a" },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [selectedUrl]);

  const copyUrl = () => {
    if (!selectedUrl) return;
    navigator.clipboard.writeText(selectedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const img = new Image();
    img.onload = () => {
      const cvs = document.createElement("canvas");
      cvs.width = img.naturalWidth;
      cvs.height = img.naturalHeight;
      const ctx = cvs.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const png = cvs.toDataURL("image/png");
      const roomPart = selectedUrl.split("/").pop() ?? "qr";
      const date = new Date().toISOString().slice(0, 10);
      const a = Object.assign(document.createElement("a"), {
        href: png,
        download: `conference-qr-${roomPart}-${date}.png`,
        style: "display:none",
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    img.src = qrDataUrl;
  };

  if (viewerUrls.length === 0) return null;

  return (
    <GlassCard glow="purple" className="flex flex-col gap-3">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <QrCode className="size-4 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">
              Share to Devices
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Scan QR to view live translations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${
              connected
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-slate-500/10 text-slate-500"
            }`}
          >
            {connected ? (
              <>
                <Wifi className="size-2.5" />
                <span>Live</span>
              </>
            ) : (
              <>
                <WifiOff className="size-2.5" />
                <span>Offline</span>
              </>
            )}
          </div>
          {connected && viewerCount > 0 && (
            <div className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
              <Users className="size-2.5" />
              <span>{viewerCount}</span>
            </div>
          )}
          {expanded ? (
            <ChevronUp className="size-4 text-slate-500" />
          ) : (
            <ChevronDown className="size-4 text-slate-500" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pt-1">
              {viewerUrls.length > 1 && (
                <div className="relative">
                  <select
                    value={selectedUrl}
                    onChange={(e) => setSelectedUrl(e.target.value)}
                    className="w-full appearance-none bg-white/5 border border-white/10 text-slate-300
                      text-xs rounded-lg px-3 py-2 pr-7 outline-none cursor-pointer"
                  >
                    {viewerUrls.map((u) => (
                      <option key={u} value={u} className="bg-[#111114]">
                        {u}
                      </option>
                    ))}
                  </select>
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs">
                    ▾
                  </span>
                </div>
              )}

              {qrDataUrl && (
                <div className="flex flex-col items-center gap-2">
                  <div className="rounded-2xl overflow-hidden border border-white/10 p-2 bg-[#0f0f1a]">
                    <img
                      ref={qrImgRef}
                      src={qrDataUrl}
                      alt="Viewer QR code"
                      className="w-40 h-40"
                    />
                  </div>
                  <button
                    onClick={downloadQr}
                    className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-violet-400
                      bg-white/5 hover:bg-violet-500/10 border border-white/10 hover:border-violet-500/30
                      rounded-lg px-3 py-1.5 transition-all"
                  >
                    <Download className="size-3" />
                    Download QR
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                <p className="text-[10px] text-slate-400 flex-1 truncate font-mono">
                  {selectedUrl}
                </p>
                <button
                  onClick={copyUrl}
                  className="text-slate-500 hover:text-violet-400 transition-colors shrink-0"
                  title="Copy URL"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </div>

              <p className="text-[10px] text-slate-600 text-center">
                Other devices on the same Wi-Fi can scan this to see live
                translations
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
