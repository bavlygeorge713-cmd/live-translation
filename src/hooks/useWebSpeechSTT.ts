import { useRef, useCallback } from "react";

// Web Speech API types not always in lib.dom.d.ts — declare them here
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
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

export function useWebSpeechSTT() {
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const start = useCallback(
    (
      onInterim: (text: string) => void,
      onFinal: (text: string) => void,
      lang = "en-US",
      onError?: (error: string) => void,
    ): boolean => {
      const SR: SpeechRecognitionCtor =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return false;

      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang || "en-US";
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += t;
          } else {
            interim += t;
          }
        }
        if (interim) onInterim(interim);
        if (final) onFinal(final);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("[WebSpeech error]", event.error);
          onError?.(event.error);
        }
      };

      // Auto-restart on end so it keeps listening continuously
      recognition.onend = () => {
        if (recognitionRef.current === recognition) {
          try { recognition.start(); } catch { /* already stopped */ }
        }
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    recognitionRef.current = null;
    try { r?.stop(); } catch { /* ignore */ }
  }, []);

  return { start, stop, isSupported };
}
