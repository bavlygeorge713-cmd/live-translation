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
import { selectClass, SelectChevron } from "@/components/ui/redesign";

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
      color: { dark: "#0f172a", light: "#ffffff" },
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
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-2)] text-tertiary">
            <QrCode className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-primary">
              Share to Devices
            </p>
            <p className="mt-0.5 text-[11px] text-tertiary">
              Scan QR to view live translations
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${
              connected
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
                : "bg-slate-100 text-slate-500 ring-slate-200"
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
            <div className="flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700 ring-1 ring-brand-200">
              <Users className="size-2.5" />
              <span>{viewerCount}</span>
            </div>
          )}
          {expanded ? (
            <ChevronUp className="size-4 text-tertiary" />
          ) : (
            <ChevronDown className="size-4 text-tertiary" />
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
                    className={selectClass}
                  >
                    {viewerUrls.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <SelectChevron />
                </div>
              )}

              {qrDataUrl && (
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
                    <img
                      ref={qrImgRef}
                      src={qrDataUrl}
                      alt="Viewer QR code"
                      className="h-40 w-40"
                    />
                  </div>
                  <button
                    onClick={downloadQr}
                    className="focus-ring flex h-9 items-center gap-1.5 rounded-[10px] border border-app bg-[var(--surface)] px-3 text-[13px] font-semibold
                      text-primary transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <Download className="size-3.5" />
                    Download QR
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2 rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                <p className="flex-1 truncate font-mono text-[11px] text-secondary">
                  {selectedUrl}
                </p>
                <button
                  onClick={copyUrl}
                  className="shrink-0 text-tertiary transition-colors hover:text-brand-600"
                  title="Copy URL"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </div>

              <p className="text-center text-[11px] text-tertiary">
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
