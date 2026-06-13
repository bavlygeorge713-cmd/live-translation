import { useState, useEffect, useCallback, useRef } from "react";

export function useSpeechSynthesis() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const speak = useCallback(
    (text: string, langBcp47: string, rate = 1.0, voiceURI?: string) => {
      if (!text.trim()) return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;

      const match = voiceURI
        ? voices.find((v) => v.voiceURI === voiceURI)
        : (voices.find((v) => v.lang === langBcp47) ??
          voices.find((v) => v.lang.startsWith(langBcp47.split("-")[0])));
      if (match) utterance.voice = match;
      utterance.lang = langBcp47 || "en-US";

      utterance.onstart = () => setIsPlaying(true);
      utterance.onend = () => setIsPlaying(false);
      utterance.onerror = () => setIsPlaying(false);

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [voices],
  );

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
  }, []);

  // Get voices for a given language code
  const voicesForLang = useCallback(
    (bcp47: string) =>
      voices.filter((v) => v.lang.startsWith(bcp47.split("-")[0])),
    [voices],
  );

  return { speak, stop, isPlaying, voices, voicesForLang };
}
