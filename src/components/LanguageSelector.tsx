import { useStore } from "@/store/translationStore";
import { LANGUAGES } from "@/types";
import {
  fieldLabelClass,
  selectClass,
  SelectChevron,
} from "@/components/ui/redesign";

const TARGETS = LANGUAGES.filter((l) => l.code !== "auto");

const SELECT_ID = "host-output-language";
const HINT = "Source is auto-detected. Select output language then press Start.";

interface Props {
  /** Top-bar variant: smaller label and select, the hint moves into the tooltip. */
  compact?: boolean;
  className?: string;
}

export function LanguageSelector({ compact = false, className = "" }: Props) {
  const { targetLang, setTargetLang } = useStore();

  return (
    <div className={`flex flex-col ${compact ? "gap-1" : "gap-2"} ${className}`}>
      <label
        htmlFor={SELECT_ID}
        className={compact ? `${fieldLabelClass} !text-[11px]` : fieldLabelClass}
      >
        Output language
      </label>
      <SelectBox
        id={SELECT_ID}
        value={targetLang}
        onChange={setTargetLang}
        options={TARGETS}
        compact={compact}
        title={compact ? HINT : undefined}
      />
      {!compact && (
        <p className="text-[11px] leading-4 text-tertiary">{HINT}</p>
      )}
    </div>
  );
}

function SelectBox({
  id,
  value,
  onChange,
  options,
  compact,
  title,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: typeof LANGUAGES;
  compact: boolean;
  title?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        className={compact ? `${selectClass} !h-9` : selectClass}
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
