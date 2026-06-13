import { useEffect, useRef, useState, useCallback } from "react";

export function useAudioVisualizer(stream: MediaStream | null, barCount = 28) {
  const [bars, setBars] = useState<number[]>(Array(barCount).fill(0));
  const ctxRef = useRef<AudioContext | null>(null);
  const frameRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    setBars(Array(barCount).fill(0));
  }, [barCount]);

  useEffect(() => {
    if (!stream) {
      cleanup();
      return;
    }

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const step = Math.max(1, Math.floor(data.length / barCount));
      setBars(
        Array.from({ length: barCount }, (_, i) => (data[i * step] ?? 0) / 255),
      );
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return cleanup;
  }, [stream, barCount, cleanup]);

  return bars;
}
