import { useRef, useState, useCallback, useEffect } from "react";
import html2canvas from "html2canvas";

export function useCanvasRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const mrRef = useRef<MediaRecorder | null>(null);
  const recordingMicRef = useRef<MediaStream | null>(null);

  // Auto-stop on page unload
  useEffect(() => {
    const handler = () => {
      if (mrRef.current?.state !== "inactive") mrRef.current?.stop();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const start = useCallback(async (liveDiv: HTMLDivElement) => {
    setDuration(0);
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    setIsRecording(true);

    // Size canvas to the visible div
    const rect = liveDiv.getBoundingClientRect();
    const W = Math.round(rect.width) || 800;
    const H = Math.round(rect.height) || 400;

    const realCanvas = document.createElement("canvas");
    realCanvas.width = W;
    realCanvas.height = H;
    const ctx = realCanvas.getContext("2d")!;

    const captureFrame = async () => {
      try {
        const snap = await html2canvas(liveDiv, {
          backgroundColor: "#000000",
          scale: 1,
          useCORS: true,
          logging: false,
          width: W,
          height: H,
        });
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(snap, 0, 0, W, H);
      } catch {
        /* ignore */
      }
    };

    // Initial frame then capture loop every 100ms
    await captureFrame();
    captureIntervalRef.current = setInterval(captureFrame, 100);

    const canvasStream = realCanvas.captureStream(10);

    // Always request a fresh dedicated mic stream — do NOT clone from the STT stream
    // (STT streams may have audio tracks that are not accessible for cloning)
    let recordingMicStream: MediaStream | undefined;
    try {
      recordingMicStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      recordingMicRef.current = recordingMicStream;
    } catch {
      /* mic unavailable — record video only */
    }

    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...(recordingMicStream?.getAudioTracks() ?? []),
    ]);

    // Pick best mime type: native MP4 → fallback WebM
    const MP4_FULL = "video/mp4;codecs=avc1,mp4a.40.2";
    const MP4_PLAIN = "video/mp4";
    const WEBM_VP9 = "video/webm;codecs=vp9,opus";

    let mimeType: string;
    let ext: string;

    if (MediaRecorder.isTypeSupported(MP4_FULL)) {
      mimeType = MP4_FULL;
      ext = "mp4";
    } else if (MediaRecorder.isTypeSupported(MP4_PLAIN)) {
      mimeType = MP4_PLAIN;
      ext = "mp4";
    } else {
      mimeType = MediaRecorder.isTypeSupported(WEBM_VP9)
        ? WEBM_VP9
        : "video/webm";
      ext = "webm";
    }

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(combined, { mimeType });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (!chunks.length) return;
      const blob = new Blob(chunks, { type: mimeType });
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), {
        href: url,
        download: `live-canvas-${date}.${ext}`,
        style: "display:none",
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    recorder.start(100);
    mrRef.current = recorder;
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    setIsRecording(false);

    recordingMicRef.current?.getTracks().forEach((t) => t.stop());
    recordingMicRef.current = null;

    const rec = mrRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    mrRef.current = null;
  }, []);

  return { isRecording, duration, start, stop };
}
