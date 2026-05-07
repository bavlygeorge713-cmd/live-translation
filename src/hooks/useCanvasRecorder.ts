import { useRef, useState, useCallback } from "react";

// ── Format definitions ────────────────────────────────────────────────────────

export type RecordingFormat = "mp4" | "webm-vp9" | "webm-vp8" | "webm-auto";

export interface FormatOption {
  id: RecordingFormat;
  label: string;
  ext: string;
  mimeType: string;
  needsWebCodecs: boolean;
}

export const FORMATS: FormatOption[] = [
  {
    id: "mp4",
    label: "MP4 · H.264 + AAC",
    ext: ".mp4",
    mimeType: "video/mp4",
    needsWebCodecs: true,
  },
  {
    id: "webm-vp9",
    label: "WebM · VP9 + Opus",
    ext: ".webm",
    mimeType: "video/webm;codecs=vp9,opus",
    needsWebCodecs: false,
  },
  {
    id: "webm-vp8",
    label: "WebM · VP8 + Opus",
    ext: ".webm",
    mimeType: "video/webm;codecs=vp8,opus",
    needsWebCodecs: false,
  },
  {
    id: "webm-auto",
    label: "WebM · Auto codec",
    ext: ".webm",
    mimeType: "video/webm",
    needsWebCodecs: false,
  },
];

export function supportsWebCodecs() {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof AudioEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof AudioData !== "undefined"
  );
}

export function isFormatSupported(fmt: FormatOption): boolean {
  if (fmt.needsWebCodecs) return supportsWebCodecs();
  return MediaRecorder.isTypeSupported(fmt.mimeType);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCanvasRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // WebM path (MediaRecorder)
  const mrRef = useRef<MediaRecorder | null>(null);
  const mrChunksRef = useRef<Blob[]>([]);
  const mrResolveRef = useRef<((b: Blob | null) => void) | null>(null);

  // MP4 path (WebCodecs)
  const mp4StopRef = useRef<(() => Promise<Blob>) | null>(null);

  // ── Start ────────────────────────────────────────────────────────────────

  const start = useCallback(
    async (
      canvas: HTMLCanvasElement,
      format: RecordingFormat,
      audioStream?: MediaStream
    ) => {
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      setIsRecording(true);

      if (format === "mp4") {
        mp4StopRef.current = await startMp4(canvas, audioStream);
      } else {
        startWebM(canvas, format, audioStream);
      }
    },
    []
  );

  // ── Stop ─────────────────────────────────────────────────────────────────

  const stop = useCallback((): Promise<Blob | null> => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);

    if (mp4StopRef.current) {
      const fn = mp4StopRef.current;
      mp4StopRef.current = null;
      return fn().catch(() => null);
    }

    return stopWebM();
  }, []);

  // ── WebM via MediaRecorder ────────────────────────────────────────────────

  function startWebM(
    canvas: HTMLCanvasElement,
    format: RecordingFormat,
    audioStream?: MediaStream
  ) {
    mrChunksRef.current = [];

    const canvasStream = canvas.captureStream(30);
    // Clone audio tracks so that stopping the mic doesn't break the recording
    audioStream?.getAudioTracks().forEach((t) => canvasStream.addTrack(t.clone()));

    const mimeType =
      FORMATS.find((f) => f.id === format)?.mimeType ?? "video/webm";
    const safeMime = MediaRecorder.isTypeSupported(mimeType) ? mimeType : "video/webm";

    const recorder = new MediaRecorder(canvasStream, {
      mimeType: safeMime,
      videoBitsPerSecond: 3_000_000,
      audioBitsPerSecond: 128_000,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) mrChunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = mrChunksRef.current.length
        ? new Blob(mrChunksRef.current, { type: safeMime })
        : null;
      mrResolveRef.current?.(blob);
      mrResolveRef.current = null;
    };

    recorder.start(100);
    mrRef.current = recorder;
  }

  function stopWebM(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const rec = mrRef.current;
      if (!rec || rec.state === "inactive") { resolve(null); return; }
      mrResolveRef.current = resolve;
      rec.stop();
    });
  }

  return { isRecording, duration, start, stop };
}

// ── MP4 via WebCodecs + mp4-muxer ────────────────────────────────────────────

async function startMp4(
  canvas: HTMLCanvasElement,
  audioStream?: MediaStream
): Promise<() => Promise<Blob>> {
  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");

  const W = canvas.width;
  const H = canvas.height;
  const FPS = 30;

  const target = new ArrayBufferTarget();

  const muxer = new Muxer({
    target,
    fastStart: "in-memory",
    video: { codec: "avc", width: W, height: H },
    ...(audioStream
      ? { audio: { codec: "aac", numberOfChannels: 1, sampleRate: 44_100 } }
      : {}),
    firstTimestampBehavior: "offset",
  });

  // ── Video encoder ──────────────────────────────────────────────────────────
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta!),
    error: console.error,
  });

  videoEncoder.configure({
    codec: "avc1.42001f", // H.264 Baseline Level 3.1
    width: W,
    height: H,
    bitrate: 3_000_000,
    framerate: FPS,
    avc: { format: "annexb" },
  });

  let frameIdx = 0;
  const frameInterval = setInterval(() => {
    if (videoEncoder.encodeQueueSize > 10) return; // back-pressure
    const ts = Math.round((frameIdx / FPS) * 1_000_000);
    const frame = new VideoFrame(canvas, { timestamp: ts });
    videoEncoder.encode(frame, { keyFrame: frameIdx % (FPS * 2) === 0 });
    frame.close();
    frameIdx++;
  }, 1000 / FPS);

  // ── Audio encoder (ScriptProcessor — works in all browsers) ───────────────
  let audioEncoder: AudioEncoder | null = null;
  let audioCtx: AudioContext | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let audioTs = 0;

  if (audioStream) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta!),
      error: console.error,
    });

    audioEncoder.configure({
      codec: "mp4a.40.2", // AAC-LC
      sampleRate: 44_100,
      numberOfChannels: 1,
      bitrate: 128_000,
    });

    audioCtx = new AudioContext({ sampleRate: 44_100 });
    // Clone tracks so stopping the mic stream mid-recording doesn't break audio
    const clonedStream = new MediaStream(audioStream.getAudioTracks().map((t) => t.clone()));
    const source = audioCtx.createMediaStreamSource(clonedStream);
    // createScriptProcessor is deprecated but still universally supported
    processorNode = audioCtx.createScriptProcessor(2048, 1, 1);

    processorNode.onaudioprocess = (e) => {
      if (!audioEncoder || audioEncoder.state === "closed") return;
      const pcm = new Float32Array(e.inputBuffer.getChannelData(0));
      const data = new AudioData({
        format: "f32",
        sampleRate: 44_100,
        numberOfFrames: pcm.length,
        numberOfChannels: 1,
        timestamp: audioTs,
        data: pcm,
      });
      audioEncoder.encode(data);
      data.close();
      audioTs += (pcm.length / 44_100) * 1_000_000;
    };

    source.connect(processorNode);
    processorNode.connect(audioCtx.destination);
  }

  // ── Return stop fn ─────────────────────────────────────────────────────────
  return async (): Promise<Blob> => {
    clearInterval(frameInterval);

    processorNode?.disconnect();
    if (audioCtx) { await audioCtx.close(); }

    await videoEncoder.flush();
    videoEncoder.close();

    if (audioEncoder) {
      await audioEncoder.flush();
      audioEncoder.close();
    }

    muxer.finalize();

    return new Blob([target.buffer], { type: "video/mp4" });
  };
}
