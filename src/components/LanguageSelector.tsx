import { useStore } from "@/store/translationStore";
import { LANGUAGES } from "@/types";

const TARGETS = LANGUAGES.filter((l) => l.code !== "auto");

export function LanguageSelector() {
  const { targetLang, setTargetLang } = useStore();

  return (
    <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-medium">
          Target Language
        </label>
        <SelectBox
          value={targetLang}
          onChange={setTargetLang}
          options={TARGETS}
        />
      </div>
      <p className="text-[11px] text-slate-600 pb-0.5 ml-2">
        Source is auto-detected. Select target language then press Start.
      </p>
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
