import { useRef, useCallback } from "react";

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

// Pause-aligned recognition windows: instead of a fixed forced-stop cycle,
// stop in a natural micro-pause (interim text unchanged for SILENCE_MS) once
// the window is at least MIN_WINDOW_MS old, with a MAX_WINDOW_MS hard cap.
// Stops landing in pauses means no in-flight words are lost at boundaries.
const SILENCE_MS = 300;
const MIN_WINDOW_MS = 1200;
const MAX_WINDOW_MS = 3500;
const WATCHDOG_MS = 100;

export function useWebSpeechSTT() {
  const instanceRef = useRef<ISpeechRecognition | null>(null);
  const recordingRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Window anchors — reset on every session start
  const windowStartTsRef = useRef(0);
  const lastInterimChangeTsRef = useRef(0);
  const lastInterimTextRef = useRef("");

  const onFinalRef = useRef<((text: string) => void) | null>(null);
  const onErrorRef = useRef<((error: string) => void) | null>(null);
  const onInterimRef = useRef<((text: string) => void) | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );

  const getSR = (): SpeechRecognitionCtor | null =>
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null;

  const resetWindowAnchors = useCallback(() => {
    const now = Date.now();
    windowStartTsRef.current = now;
    lastInterimChangeTsRef.current = now;
    lastInterimTextRef.current = "";
  }, []);

  const buildInstance = useCallback(
    (lang: string): ISpeechRecognition | null => {
      const SR = getSR();
      if (!SR) return null;

      const inst = new SR();
      inst.continuous = true;
      inst.interimResults = true; // interim events are the silence signal — never displayed or translated
      inst.maxAlternatives = 1;
      inst.lang = lang;

      // Fires on every session start, including Chrome self-restarts after
      // no-speech/network errors routed through onend
      inst.onstart = () => {
        if (instanceRef.current === inst) resetWindowAnchors();
      };

      inst.onresult = (event: SpeechRecognitionEvent) => {
        let finalText = "";
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal)
            finalText += event.results[i][0].transcript;
          else interimText += event.results[i][0].transcript;
        }
        // Track silence: bump the timestamp only when interim text actually changes
        if (interimText.trim() && interimText !== lastInterimTextRef.current) {
          lastInterimTextRef.current = interimText;
          lastInterimChangeTsRef.current = Date.now();
          onInterimRef.current?.(interimText.trim());
        }
        if (finalText.trim()) onFinalRef.current?.(finalText.trim());
      };

      inst.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed" || event.error === "audio-capture") {
          onErrorRef.current?.(event.error);
          recordingRef.current = false;
          return;
        }
        // Other errors (no-speech, aborted, network): onend will restart
      };

      inst.onend = () => {
        if (!recordingRef.current) return;
        if (instanceRef.current !== inst) return;
        resetWindowAnchors();
        try {
          inst.start();
        } catch {
          /* ignore */
        }
      };

      return inst;
    },
    [resetWindowAnchors],
  );

  const startWatchdog = useCallback(() => {
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    watchdogRef.current = setInterval(() => {
      if (!recordingRef.current) return;
      const now = Date.now();
      const windowAge = now - windowStartTsRef.current;
      const silence = now - lastInterimChangeTsRef.current;

      // Stop in a micro-pause once the window has speech and is old enough;
      // hard cap keeps windows bounded during continuous speech
      const pauseStop =
        lastInterimTextRef.current !== "" &&
        silence >= SILENCE_MS &&
        windowAge >= MIN_WINDOW_MS;
      const hardStop = windowAge >= MAX_WINDOW_MS;

      if (pauseStop || hardStop) {
        // Optimistic re-anchor so the watchdog doesn't re-fire while the
        // session is restarting; onstart re-anchors precisely
        resetWindowAnchors();
        try {
          instanceRef.current?.stop();
        } catch {
          /* ignore */
        }
      }
    }, WATCHDOG_MS);
  }, [resetWindowAnchors]);

  const start = useCallback(
    (
      lang: string,
      onFinal: (text: string) => void,
      onError?: (error: string) => void,
      onInterim?: (text: string) => void,
    ): boolean => {
      if (!getSR()) return false;

      onFinalRef.current = onFinal;
      onErrorRef.current = onError ?? null;
      onInterimRef.current = onInterim ?? null;
      recordingRef.current = true;

      const inst = buildInstance(lang);
      if (!inst) {
        recordingRef.current = false;
        return false;
      }
      instanceRef.current = inst;

      resetWindowAnchors();
      try {
        inst.start();
      } catch {
        recordingRef.current = false;
        return false;
      }

      startWatchdog();
      return true;
    },
    [buildInstance, resetWindowAnchors, startWatchdog],
  );

  const stop = useCallback(() => {
    recordingRef.current = false;
    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }
    const inst = instanceRef.current;
    instanceRef.current = null;
    try {
      inst?.stop();
    } catch {
      /* ignore */
    }
  }, []);

  const restart = useCallback(
    (lang: string) => {
      if (!recordingRef.current) return;
      if (watchdogRef.current) {
        clearInterval(watchdogRef.current);
        watchdogRef.current = null;
      }
      const oldInst = instanceRef.current;
      const newInst = buildInstance(lang);
      if (!newInst) return;
      instanceRef.current = newInst;
      try {
        oldInst?.stop();
      } catch {
        /* ignore */
      }
      resetWindowAnchors();
      try {
        newInst.start();
      } catch {
        /* ignore */
      }
      startWatchdog();
    },
    [buildInstance, resetWindowAnchors, startWatchdog],
  );

  return { start, stop, restart, isSupported };
}
