import { ArrowLeftRight } from "lucide-react";
import { useStore, TranslationProvider } from "@/store/translationStore";
import { LANGUAGES } from "@/types";
import { Button } from "@/components/ui/Button";

const TARGETS = LANGUAGES.filter((l) => l.code !== "auto");

const PROVIDERS: { value: TranslationProvider; label: string; badge: string }[] = [
  { value: "google", label: "Google Translate", badge: "Free · No key needed" },
  { value: "deepl",  label: "DeepL",            badge: "500k chars/mo free" },
];

export function LanguageSelector() {
  const {
    sourceLang, targetLang, setSourceLang, setTargetLang, swapLangs,
    translationProvider, deeplApiKey, setTranslationProvider, setDeeplApiKey,
  } = useStore();

  return (
    <div className="flex flex-col gap-4">
      {/* ── Language pair ── */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            Source Language
          </label>
          <SelectBox value={sourceLang} onChange={setSourceLang} options={LANGUAGES} />
        </div>

        <div className="pb-0.5">
          <Button variant="ghost" size="icon" onClick={swapLangs} title="Swap languages">
            <ArrowLeftRight className="size-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            Target Language
          </label>
          <SelectBox value={targetLang} onChange={setTargetLang} options={TARGETS} />
        </div>

        <p className="text-[11px] text-slate-600 pb-0.5 ml-2">
          Select your languages, then press Start Recording.
        </p>
      </div>

      {/* ── Translation engine ── */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-white/[0.06] pt-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
            Translation Engine
          </label>
          <div className="flex gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                onClick={() => setTranslationProvider(p.value)}
                className={`flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all ${
                  translationProvider === p.value
                    ? "bg-blue-600/15 border-blue-500/40 text-blue-300"
                    : "bg-white/[0.03] border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-slate-300"
                }`}
              >
                <span className="text-xs font-semibold">{p.label}</span>
                <span className={`text-[10px] ${translationProvider === p.value ? "text-blue-400/70" : "text-slate-600"}`}>
                  {p.badge}
                </span>
              </button>
            ))}
          </div>
        </div>

        {translationProvider === "deepl" && (
          <div className="flex flex-col gap-1 min-w-[260px]">
            <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
              DeepL API Key
            </label>
            <input
              type="password"
              value={deeplApiKey}
              onChange={(e) => setDeeplApiKey(e.target.value)}
              placeholder="Paste your free key from deepl.com"
              className="bg-white/5 border border-white/10 text-slate-300 text-xs rounded-xl
                px-3 py-2 outline-none placeholder-slate-700
                focus:border-blue-500/40 transition-colors"
            />
            {!deeplApiKey.trim() && (
              <p className="text-[10px] text-amber-500/70">
                No key → falling back to Google Translate automatically.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: typeof LANGUAGES;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white/5 border border-white/10 text-slate-200 text-sm
          font-medium rounded-xl px-3 py-2 pr-7 outline-none cursor-pointer
          hover:border-white/20 transition-colors min-w-[180px]"
      >
        {options.map((l) => (
          <option key={l.code} value={l.code} className="bg-[#111114]">
            {l.flag} {l.name}
          </option>
        ))}
      </select>
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-xs">
        ▾
      </span>
    </div>
  );
}
