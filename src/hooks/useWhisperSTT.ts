import { useRef, useCallback } from "react";

// Groq Whisper STT: MediaRecorder captures pause-aligned audio windows and
// POSTs them to /api/transcribe; the response text feeds onFinal — the same
// contract as useWebSpeechSTT, but driven by Web Audio RMS energy, fully
// independent of Chrome recognition.
//
// Windows close on real sentence pauses (≥600ms of silence once the window is
// ≥2500ms old, hard cap 7000ms). Natural speech yields 3-5s windows → ~8-15
// requests/min, safely under Groq's free-tier ~20 req/min Whisper limit.
// Average felt latency ≈ half the window length + ~1s (Whisper + GTX): with
// windows closing on natural pauses that's ~2.5-3s behind speech — the
// live-captioning standard.

const SILENCE_MS = 450; // was 600 — close on real pauses sooner
const MIN_WINDOW_MS = 2500; // windows align with sentence boundaries
const MAX_WINDOW_MS = 7000;
const TICK_MS = 100;
const TIMESLICE_MS = 250;
const NOISE_FLOOR_SAMPLES = 50; // rolling 5s of 100ms RMS samples
const THRESHOLD_MULT = 2.5; // speech = RMS above 2.5× the noise-floor minimum
const MIN_THRESHOLD = 0.01; // absolute floor so digital silence isn't "speech"
const REQUEST_TIMEOUT_MS = 8000;
const EARLY_CLOSE_SILENCE_MS = 700; // RMS below noise floor this long → close before MIN_WINDOW_MS
const EARLY_CLOSE_AGE_MS = 1800; // ...only if window is at least this old
// 429s don't count toward fallback — they get a delayed retry instead. Only a
// sustained run of fully rate-limited windows (quota truly exhausted, e.g. the
// daily cap) forces the engine switch, so the "(rate limited)" notice stays
// reachable without hair-triggering on a transient burst.
const MAX_FAIL_STREAK = 6; // consecutive NON-429 failures → onUnavailable
const MAX_RATE_LIMIT_STREAK = 4; // consecutive windows fully lost to 429 → onUnavailable
const RATE_LIMIT_RETRY_MS = 2000; // hold a 429'd window and retry once after this

interface AudioWindow {
  rec: MediaRecorder;
  chunks: Blob[];
  startTs: number;
  hadSpeech: boolean;
  seq: number;
  sendOnStop: boolean;
  settled: boolean;
}

export type WhisperFailReason = "rate-limit" | "server-error";

export interface WhisperStartOptions {
  /** Existing mic stream to clone tracks from; a fresh one is requested if omitted. */
  stream?: MediaStream | null;
  lang: string;
  onFinal: (text: string) => void;
  /** A window captured speech but transcription failed — caller may promote the draft. */
  onWindowFail?: () => void;
  /** Whisper can't continue (repeated API failures / recorder death) — switch engines. */
  onUnavailable?: (reason: WhisperFailReason) => void;
  onError?: (error: string) => void;
}

// 0.2s of 8kHz mono 16-bit silence — a minimal valid WAV for health checks
function makeSilentWav(): Blob {
  const sampleRate = 8000;
  const numSamples = 1600;
  const dataSize = numSamples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, "data");
  v.setUint32(40, dataSize, true);
  return new Blob([buf], { type: "audio/wav" });
}

export function useWhisperSTT() {
  const runningRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRef = useRef<AudioWindow | null>(null);
  const mimeTypeRef = useRef("");
  const langRef = useRef("en");

  const lastSpeechTsRef = useRef(0);
  const lastAboveFloorTsRef = useRef(0); // last time RMS was at or above noise-floor min
  const rmsHistoryRef = useRef<number[]>([]);

  // Transcriptions can resolve out of order; emit strictly in window order
  const windowSeqRef = useRef(0);
  const nextEmitSeqRef = useRef(0);
  const resultsRef = useRef<Map<number, string>>(new Map());

  const failStreakRef = useRef(0); // consecutive non-429 failures
  const rateLimitStreakRef = useRef(0); // consecutive windows fully lost to 429
  const abortersRef = useRef<Set<AbortController>>(new Set());

  const onFinalRef = useRef<((text: string) => void) | null>(null);
  const onWindowFailRef = useRef<(() => void) | null>(null);
  const onUnavailableRef = useRef<((reason: WhisperFailReason) => void) | null>(
    null,
  );
  const onErrorRef = useRef<((error: string) => void) | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!(window.AudioContext || (window as any).webkitAudioContext);

  const pickMimeType = (): string => {
    for (const c of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
      try {
        if (MediaRecorder.isTypeSupported(c)) return c;
      } catch {
        /* ignore */
      }
    }
    return "";
  };

  const emitReady = () => {
    while (resultsRef.current.has(nextEmitSeqRef.current)) {
      const text = resultsRef.current.get(nextEmitSeqRef.current)!;
      resultsRef.current.delete(nextEmitSeqRef.current);
      nextEmitSeqRef.current++;
      if (text && runningRef.current) onFinalRef.current?.(text);
    }
  };

  const settleWindow = (w: AudioWindow, text: string) => {
    if (w.settled) return;
    w.settled = true;
    resultsRef.current.set(w.seq, text);
    emitReady();
  };

  // One POST attempt. Returns the transcription or a typed failure;
  // throws only on network error / abort / timeout.
  const postWindow = async (
    blob: Blob,
  ): Promise<{ ok: boolean; rateLimited: boolean; text: string }> => {
    const ctrl = new AbortController();
    abortersRef.current.add(ctrl);
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      const form = new FormData();
      const ext = mimeTypeRef.current.includes("mp4") ? "mp4" : "webm";
      form.append("audio", blob, `window.${ext}`);
      const code = langRef.current.split("-")[0].toLowerCase();
      if (code) form.append("language", code);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
        signal: ctrl.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        return { ok: true, rateLimited: false, text: (data.text ?? "").trim() };
      }
      return { ok: false, rateLimited: res.status === 429, text: "" };
    } finally {
      clearTimeout(timer);
      abortersRef.current.delete(ctrl);
    }
  };

  const transcribeBlob = async (w: AudioWindow, blob: Blob) => {
    try {
      let r = await postWindow(blob);

      // 429: never counts toward fallback directly — the server already rotated
      // KEY_1→KEY_2, so hold the window and retry once after a backoff. The
      // reorder buffer keeps later windows queued behind it, so the transcript
      // still flows in order, just delayed.
      if (!r.ok && r.rateLimited && runningRef.current) {
        await new Promise((resolve) =>
          setTimeout(resolve, RATE_LIMIT_RETRY_MS),
        );
        if (runningRef.current) r = await postWindow(blob);
      }

      if (r.ok) {
        failStreakRef.current = 0;
        rateLimitStreakRef.current = 0;
        settleWindow(w, r.text);
        return;
      }
      settleWindow(w, "");
      if (!runningRef.current) return;
      if (w.hadSpeech) onWindowFailRef.current?.(); // speech captured but transcription failed
      if (r.rateLimited) {
        rateLimitStreakRef.current++;
        if (rateLimitStreakRef.current === MAX_RATE_LIMIT_STREAK)
          onUnavailableRef.current?.("rate-limit");
      } else {
        failStreakRef.current++;
        if (failStreakRef.current === MAX_FAIL_STREAK)
          onUnavailableRef.current?.("server-error");
      }
    } catch {
      settleWindow(w, "");
      if (!runningRef.current) return;
      if (w.hadSpeech) onWindowFailRef.current?.();
      failStreakRef.current++;
      if (failStreakRef.current === MAX_FAIL_STREAK)
        onUnavailableRef.current?.("server-error");
    }
  };

  /** Probe /api/transcribe with a tiny silent WAV — used for auto-recovery. */
  const healthCheck = useCallback(async (): Promise<boolean> => {
    try {
      const form = new FormData();
      form.append("audio", makeSilentWav(), "ping.wav");
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
          signal: ctrl.signal,
        });
        return res.ok;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }, []);

  const startNewWindow = (): boolean => {
    const stream = streamRef.current;
    if (!stream || !runningRef.current) return false;

    let rec: MediaRecorder;
    try {
      rec = mimeTypeRef.current
        ? new MediaRecorder(stream, { mimeType: mimeTypeRef.current })
        : new MediaRecorder(stream);
    } catch {
      onErrorRef.current?.("recorder-create-failed");
      onUnavailableRef.current?.("server-error");
      return false;
    }

    const w: AudioWindow = {
      rec,
      chunks: [],
      startTs: Date.now(),
      hadSpeech: false,
      seq: windowSeqRef.current++,
      sendOnStop: false,
      settled: false,
    };

    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) w.chunks.push(e.data);
    };
    rec.onstop = () => {
      if (w.sendOnStop && w.chunks.length > 0) {
        // Upload starts the instant the recorder flushes — Blob assembly is a
        // zero-copy view over the chunks and the fetch fires synchronously
        // here, so the POST is in flight within ~50ms of window close.
        void transcribeBlob(
          w,
          new Blob(w.chunks, { type: mimeTypeRef.current || "audio/webm" }),
        );
      } else {
        settleWindow(w, ""); // discarded (silent) window — keep the emit chain moving
      }
    };
    rec.onerror = () => {
      settleWindow(w, "");
      onErrorRef.current?.("recorder-error");
      if (currentRef.current === w && runningRef.current) {
        currentRef.current = null;
        startNewWindow();
      }
    };

    currentRef.current = w;
    try {
      rec.start(TIMESLICE_MS);
    } catch {
      currentRef.current = null;
      settleWindow(w, "");
      onErrorRef.current?.("recorder-start-failed");
      onUnavailableRef.current?.("server-error");
      return false;
    }
    return true;
  };

  const closeWindow = (transcribe: boolean) => {
    const w = currentRef.current;
    if (!w) return;
    w.sendOnStop = transcribe && w.hadSpeech;
    currentRef.current = null;
    // Start the next window first so the gap stays <100ms (it lands in silence by design)
    startNewWindow();
    try {
      w.rec.stop();
    } catch {
      settleWindow(w, "");
    }
  };

  const tick = () => {
    if (!runningRef.current) return;
    const analyser = analyserRef.current;
    const buf = vadBufRef.current;
    if (!analyser || !buf) return;

    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);

    // Adaptive threshold: 2.5× the rolling 5s noise-floor minimum
    const hist = rmsHistoryRef.current;
    hist.push(rms);
    if (hist.length > NOISE_FLOOR_SAMPLES) hist.shift();
    const noiseFloorMin = hist.length > 0 ? Math.min(...hist) : MIN_THRESHOLD;
    const threshold = Math.max(noiseFloorMin * THRESHOLD_MULT, MIN_THRESHOLD);

    const now = Date.now();
    // Track when RMS is above the noise floor for the early-close path
    if (rms >= noiseFloorMin) lastAboveFloorTsRef.current = now;

    const w = currentRef.current;
    if (rms >= threshold) {
      lastSpeechTsRef.current = now;
      if (w) w.hadSpeech = true;
    }
    if (!w) return;

    const age = now - w.startTs;
    const silence = now - lastSpeechTsRef.current;
    const strongSilence = now - lastAboveFloorTsRef.current;

    if (
      w.hadSpeech &&
      ((silence >= SILENCE_MS && age >= MIN_WINDOW_MS) ||
        age >= MAX_WINDOW_MS ||
        (strongSilence >= EARLY_CLOSE_SILENCE_MS && age >= EARLY_CLOSE_AGE_MS))
    ) {
      closeWindow(true);
    } else if (!w.hadSpeech && age >= MAX_WINDOW_MS) {
      closeWindow(false); // pure silence — discard without an API call
    }
  };

  const stop = useCallback(() => {
    runningRef.current = false;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }

    const w = currentRef.current;
    currentRef.current = null;
    if (w) {
      w.sendOnStop = false;
      try {
        w.rec.stop();
      } catch {
        /* ignore */
      }
    }

    abortersRef.current.forEach((c) => c.abort());
    abortersRef.current.clear();
    resultsRef.current.clear();

    try {
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    sourceRef.current = null;
    analyserRef.current = null;
    vadBufRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx)
      void ctx.close().catch(() => {
        /* ignore */
      });

    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
  }, []);

  const start = useCallback(
    async (opts: WhisperStartOptions): Promise<boolean> => {
      if (!isSupported) return false;
      if (runningRef.current) stop();

      onFinalRef.current = opts.onFinal;
      onWindowFailRef.current = opts.onWindowFail ?? null;
      onUnavailableRef.current = opts.onUnavailable ?? null;
      onErrorRef.current = opts.onError ?? null;
      langRef.current = opts.lang;

      // Clone the panel's mic tracks when provided so the two consumers are independent
      let stream: MediaStream;
      try {
        const provided = opts.stream?.getAudioTracks() ?? [];
        stream =
          provided.length > 0
            ? new MediaStream(provided.map((t) => t.clone()))
            : await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
              });
      } catch {
        return false;
      }

      try {
        const Ctx: typeof AudioContext =
          window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new Ctx();
        void ctx.resume().catch(() => {
          /* ignore */
        });
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        sourceRef.current = source;
        analyserRef.current = analyser;
        vadBufRef.current = new Float32Array(analyser.fftSize);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }

      mimeTypeRef.current = pickMimeType();
      streamRef.current = stream;
      runningRef.current = true;

      rmsHistoryRef.current = [];
      lastSpeechTsRef.current = 0;
      lastAboveFloorTsRef.current = Date.now();
      windowSeqRef.current = 0;
      nextEmitSeqRef.current = 0;
      resultsRef.current.clear();
      failStreakRef.current = 0;
      rateLimitStreakRef.current = 0;

      // Mic track dying (revoked permission, device unplug) → let the panel switch engines
      stream.getTracks().forEach((t) => {
        t.onended = () => {
          if (runningRef.current) onUnavailableRef.current?.("server-error");
        };
      });

      if (!startNewWindow()) {
        stop();
        return false;
      }
      tickRef.current = setInterval(tick, TICK_MS);
      return true;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [isSupported, stop],
  );

  /** Whisper advantage: language switches mid-session without a restart */
  const setLanguage = useCallback((lang: string) => {
    langRef.current = lang;
  }, []);

  return { start, stop, setLanguage, healthCheck, isSupported };
}
