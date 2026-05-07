import { TranslationEntry } from "@/types";

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: name,
    style: "display:none",
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadVideo = (blob: Blob, ext = ".webm") =>
  triggerDownload(blob, `translation${ext}`);

export const downloadText = (entries: TranslationEntry[]) => {
  const content = entries
    .map(
      (e, i) =>
        `[${i + 1}] ${new Date(e.timestamp).toLocaleTimeString()}\n` +
        `${e.sourceLang}: ${e.originalText}\n` +
        `${e.targetLang}: ${e.translatedText}`
    )
    .join("\n\n---\n\n");
  triggerDownload(new Blob([content], { type: "text/plain" }), "translations.txt");
};

export const downloadSRT = (entries: TranslationEntry[]) => {
  let srt = "";
  entries.forEach((e, i) => {
    const ts = new Date(e.timestamp);
    const start = toSRT(ts);
    const end = toSRT(new Date(ts.getTime() + wordsMs(e.translatedText)));
    srt += `${i + 1}\n${start} --> ${end}\n${e.translatedText}\n\n`;
  });
  triggerDownload(new Blob([srt], { type: "text/srt" }), "subtitles.srt");
};

function toSRT(d: Date) {
  return (
    [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":") +
    "," +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}

function wordsMs(text: string) {
  return Math.max(2000, (text.split(/\s+/).length / 150) * 60_000);
}

// ── Canvas subtitle rendering ────────────────────────────────────────────────

export function drawSubtitleFrame(
  ctx: CanvasRenderingContext2D,
  text: string,        // translatedText — accumulated translated session
  transcribed: string, // transcribedText — live transcript (including interim)
  processingState: string,
  width: number,
  height: number
) {
  const PX = 64;         // horizontal padding (left margin for document text)
  const PY = 52;         // vertical padding
  const availW = width - PX * 2;

  // ── Background — always dark ──────────────────────────────────────────────
  ctx.fillStyle = "#08080f";
  ctx.fillRect(0, 0, width, height);

  // Subtle blue radial glow
  const grd = ctx.createRadialGradient(width * 0.15, height * 0.3, 0, width * 0.5, height * 0.5, width * 0.7);
  grd.addColorStop(0, "rgba(59,130,246,0.06)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  // Top accent line
  const lg = ctx.createLinearGradient(0, 0, width, 0);
  lg.addColorStop(0, "transparent");
  lg.addColorStop(0.3, "#3b82f6");
  lg.addColorStop(0.7, "#8b5cf6");
  lg.addColorStop(1, "transparent");
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, width, 3);

  // ── Status badge (top-right) ───────────────────────────────────────────────
  if (processingState === "translating") {
    ctx.font = `500 14px Inter, system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(167,139,250,0.8)";
    ctx.fillText("◆ Translating…", width - PX, PY - 32);
  } else if (processingState === "transcribing") {
    ctx.font = `500 14px Inter, system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(96,165,250,0.7)";
    ctx.fillText("● Listening…", width - PX, PY - 32);
  }

  // ── Placeholder when nothing has been said yet ─────────────────────────────
  if (!text && !transcribed) {
    // Draw a subtle document-like frame
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    ctx.strokeRect(PX, PY, availW, height - PY * 2);

    ctx.font = `400 ${Math.floor(width / 56)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(100,116,139,0.35)";
    ctx.fillText("Press Start and begin speaking…", PX + 16, PY + 20);

    _watermark(ctx, width, height);
    return;
  }

  // ── Decide main text ───────────────────────────────────────────────────────
  const mainText = text || transcribed;
  const mainIsTranslation = !!text;
  const isTranscribing = processingState === "transcribing";

  // Reserve bottom strip for live interim when translation is already showing
  const interimFontSz = Math.floor(width / 58);
  const needsInterimStrip = isTranscribing && mainIsTranslation && !!transcribed;
  const interimAreaH = needsInterimStrip ? interimFontSz * 2.8 + 24 : 0;
  const mainAreaH = height - PY * 2 - interimAreaH;

  // ── Dynamic font size ──────────────────────────────────────────────────────
  const chars = mainText.length;
  let fontSize =
    chars < 60   ? 56 :
    chars < 150  ? 48 :
    chars < 320  ? 40 :
    chars < 600  ? 34 :
    chars < 1000 ? 28 :
    chars < 1600 ? 24 : 20;
  fontSize = Math.max(20, Math.min(60, fontSize));

  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  const lines = wrapText(ctx, mainText, availW);
  const lineH = fontSize * 1.6;
  const maxLines = Math.max(1, Math.floor(mainAreaH / lineH));

  // Show newest lines (scroll oldest off top — document/letter reads top to bottom)
  const visLines = lines.length > maxLines ? lines.slice(-maxLines) : lines;

  // Always start from top (document/letter style — not centered)
  const y0 = PY;

  // ── Draw main text LEFT-ALIGNED (horizontal document style) ───────────────
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = mainIsTranslation ? "#f0f4f8" : "rgba(148,163,184,0.65)";

  visLines.forEach((line, i) => {
    ctx.fillText(line, PX, y0 + i * lineH);
  });

  // Blinking cursor at end of last line while active
  if (isTranscribing || processingState === "translating") {
    const lastLine = visLines[visLines.length - 1] ?? "";
    const lastLineW = ctx.measureText(lastLine).width;
    const cursorX = PX + lastLineW + 6;
    const cursorY = y0 + (visLines.length - 1) * lineH;
    const now = Date.now();
    if (Math.floor(now / 500) % 2 === 0) {
      ctx.fillStyle = "rgba(96,165,250,0.9)";
      ctx.fillRect(cursorX, cursorY + fontSize * 0.1, 3, fontSize * 0.85);
    }
  }

  ctx.shadowBlur = 0;

  // ── Live interim strip — shows current speech below the translation ────────
  if (needsInterimStrip) {
    // Separator line
    const sepY = height - PY - interimAreaH;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PX, sepY);
    ctx.lineTo(width - PX, sepY);
    ctx.stroke();

    const interimLines = wrapText(ctx, transcribed, availW);
    const lastTwo = interimLines.slice(-2);
    ctx.font = `400 ${interimFontSz}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = "rgba(100,116,139,0.5)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    lastTwo.forEach((line, i) => {
      const yy = sepY + 12 + i * (interimFontSz * 1.45);
      ctx.fillText(line + (i === lastTwo.length - 1 ? " ▌" : ""), PX, yy);
    });
  }

  _watermark(ctx, width, height);
}

function _watermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.font = "12px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(148,163,184,0.18)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("HY Translator · Local AI", width - 16, height - 12);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
