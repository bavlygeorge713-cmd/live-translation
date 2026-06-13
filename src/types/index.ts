export interface Language {
  code: string;
  name: string;
  flag: string;
  bcp47: string; // for SpeechSynthesis
}

export interface TranslationEntry {
  id: string;
  originalText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: Date;
}

export type ProcessingState =
  | "idle"
  | "loading_stt"
  | "transcribing"
  | "loading_translation"
  | "translating"
  | "speaking"
  | "error";

export type RecordingState = "idle" | "recording" | "stopped";

export const LANGUAGES: Language[] = [
  { code: "auto", name: "Auto Detect", flag: "🌐", bcp47: "en-US" },
  { code: "en", name: "English", flag: "🇺🇸", bcp47: "en-US" },
  { code: "ar", name: "Arabic (Egyptian)", flag: "🇪🇬", bcp47: "ar-EG" },
  { code: "zh", name: "Chinese", flag: "🇨🇳", bcp47: "zh-CN" },
  { code: "cs", name: "Czech", flag: "🇨🇿", bcp47: "cs-CZ" },
  { code: "da", name: "Danish", flag: "🇩🇰", bcp47: "da-DK" },
  { code: "nl", name: "Dutch", flag: "🇳🇱", bcp47: "nl-NL" },
  { code: "fi", name: "Finnish", flag: "🇫🇮", bcp47: "fi-FI" },
  { code: "fr", name: "French", flag: "🇫🇷", bcp47: "fr-FR" },
  { code: "de", name: "German", flag: "🇩🇪", bcp47: "de-DE" },
  { code: "el", name: "Greek", flag: "🇬🇷", bcp47: "el-GR" },
  { code: "hi", name: "Hindi", flag: "🇮🇳", bcp47: "hi-IN" },
  { code: "hu", name: "Hungarian", flag: "🇭🇺", bcp47: "hu-HU" },
  { code: "id", name: "Indonesian", flag: "🇮🇩", bcp47: "id-ID" },
  { code: "it", name: "Italian", flag: "🇮🇹", bcp47: "it-IT" },
  { code: "ja", name: "Japanese", flag: "🇯🇵", bcp47: "ja-JP" },
  { code: "ko", name: "Korean", flag: "🇰🇷", bcp47: "ko-KR" },
  { code: "no", name: "Norwegian", flag: "🇳🇴", bcp47: "nb-NO" },
  { code: "pl", name: "Polish", flag: "🇵🇱", bcp47: "pl-PL" },
  { code: "pt", name: "Portuguese", flag: "🇧🇷", bcp47: "pt-BR" },
  { code: "ro", name: "Romanian", flag: "🇷🇴", bcp47: "ro-RO" },
  { code: "ru", name: "Russian", flag: "🇷🇺", bcp47: "ru-RU" },
  { code: "es", name: "Spanish", flag: "🇪🇸", bcp47: "es-ES" },
  { code: "sv", name: "Swedish", flag: "🇸🇪", bcp47: "sv-SE" },
  { code: "th", name: "Thai", flag: "🇹🇭", bcp47: "th-TH" },
  { code: "tr", name: "Turkish", flag: "🇹🇷", bcp47: "tr-TR" },
  { code: "uk", name: "Ukrainian", flag: "🇺🇦", bcp47: "uk-UA" },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳", bcp47: "vi-VN" },
];
