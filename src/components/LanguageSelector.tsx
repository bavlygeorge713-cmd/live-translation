import { useStore } from "@/store/translationStore";
import { LANGUAGES } from "@/types";
import {
  fieldLabelClass,
  selectClass,
  SelectChevron,
} from "@/components/ui/redesign";

const TARGETS = LANGUAGES.filter((l) => l.code !== "auto");

export function LanguageSelector() {
  const { targetLang, setTargetLang } = useStore();

  return (
    <div className="flex flex-col gap-2">
      <label className={fieldLabelClass}>Target language</label>
      <SelectBox
        value={targetLang}
        onChange={setTargetLang}
        options={TARGETS}
      />
      <p className="text-[11px] leading-4 text-tertiary">
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
        className={selectClass}
      >
        {options.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.name}
          </option>
        ))}
      </select>
      <SelectChevron />
    </div>
  );
}
