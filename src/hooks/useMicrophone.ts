import { useState, useRef, useCallback, useEffect } from "react";

// ── Audio device enumeration ─────────────────────────────────────────────────

export function useAudioDevices() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      // permission denied — labels will be empty strings
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    setDevices(all.filter((d) => d.kind === "audioinput"));
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refresh]);

  return { devices, refresh };
}

// ── Blob → Float32Array resampled to 16 kHz (Whisper input format) ───────────

export async function audioBlobToFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;

  // Decode at the browser's native rate first — creating AudioContext with a
  // non-standard sampleRate causes decodeAudioData to fail on many platforms.
  const ctx = new AudioCtx();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close();
  }

  // Whisper expects 16 kHz mono. Resample with OfflineAudioContext.
  const TARGET = 16_000;
  if (audioBuffer.sampleRate === TARGET && audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }
  const length = Math.ceil(audioBuffer.duration * TARGET);
  const offline = new OfflineAudioContext(1, Math.max(1, length), TARGET);
  const src = offline.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(offline.destination);
  src.start(0);
  const resampled = await offline.startRendering();
  return resampled.getChannelData(0);
}

// ── Microphone capture ───────────────────────────────────────────────────────

export function useMicrophone() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopFnRef = useRef<(() => void) | null>(null);

  const start = useCallback(
    async (
      onChunk: (blob: Blob) => void,
      intervalMs = 3_000,
      deviceId?: string,
    ): Promise<MediaStream | null> => {
      setError(null);
      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        };

        const s = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(s);
        setIsListening(true);

        const mimeType =
          ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"].find((t) =>
            MediaRecorder.isTypeSupported(t),
          ) ?? "";

        let running = true;
        let currentMr: MediaRecorder | null = null;

        // Stop & restart each cycle so every blob is a complete, self-contained
        // audio file with its own WebM/OGG header — a continuous timesliced stream
        // only puts the header in the first chunk, making subsequent blobs
        // undecodeable by AudioContext.decodeAudioData.
        function cycle() {
          if (!running) return;

          const chunks: Blob[] = [];
          const mr = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
          currentMr = mr;

          mr.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          mr.onstop = () => {
            if (running && chunks.length > 0) {
              const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
              onChunk(blob);
            }
            if (running) setTimeout(cycle, 50);
          };

          mr.start(100);

          // Stop after intervalMs → triggers onstop → fires onChunk → restarts
          setTimeout(() => {
            if (mr.state === "recording") mr.stop();
          }, intervalMs);
        }

        cycle();

        stopFnRef.current = () => {
          running = false;
          if (currentMr && currentMr.state === "recording") {
            currentMr.onstop = null; // don't restart
            currentMr.stop();
          }
          s.getTracks().forEach((t) => t.stop());
        };

        return s;
      } catch (err) {
        const msg =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Microphone access denied."
            : err instanceof DOMException && err.name === "NotFoundError"
              ? "Selected device not found."
              : "Cannot access microphone.";
        setError(msg);
        return null;
      }
    },
    [],
  );

  const stop = useCallback(() => {
    stopFnRef.current?.();
    stopFnRef.current = null;
    setStream(null);
    setIsListening(false);
  }, []);

  return { stream, isListening, error, start, stop };
}
