import { useEffect, useRef, useState } from "react";
import { LANGUAGES } from "@/types";
import { GlassCard } from "@/components/ui/GlassCard";
import type { BroadcastMessage } from "@/hooks/useBroadcast";

const LS_ALLOWED = "ct_allowed_langs";
const LS_MAX = "ct_max_langs_count";
const DEFAULT_MAX = 5;

interface Props {
  send: (msg: BroadcastMessage) => void;
  viewerCount: number;
}

export function AllowedLangsPanel({ send, viewerCount }: Props) {
  const [allowedLangs, setAllowedLangs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_ALLOWED) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const [maxCount, setMaxCount] = useState<number>(() => {
    const stored = parseInt(localStorage.getItem(LS_MAX) ?? "", 10);
    return isNaN(stored) || stored < 1 ? DEFAULT_MAX : stored;
  });

  const allowedLangsRef = useRef(allowedLangs);
  allowedLangsRef.current = allowedLangs;
  const maxCountRef = useRef(maxCount);
  maxCountRef.current = maxCount;
  const sendRef = useRef(send);
  sendRef.current = send;

  const publishConfig = (langs: string[], max: number) => {
    sendRef.current({ type: "config", allowedLangs: langs, maxCount: max });
  };

  // Re-publish config whenever a viewer joins so late-joiners receive current config
  useEffect(() => {
    if (viewerCount > 0) {
      publishConfig(allowedLangsRef.current, maxCountRef.current);
    }
  }, [viewerCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleLang = (code: string) => {
    setAllowedLangs((prev) => {
      const next = prev.includes(code)
        ? prev.filter((l) => l !== code)
        : prev.length < maxCountRef.current
          ? [...prev, code]
          : prev;
      localStorage.setItem(LS_ALLOWED, JSON.stringify(next));
      publishConfig(next, maxCountRef.current);
      return next;
    });
  };

  const handleMaxChange = (val: number) => {
    const next = Math.max(1, Math.min(20, val));
    setMaxCount(next);
    maxCountRef.current = next;
    localStorage.setItem(LS_MAX, String(next));
    const trimmed = allowedLangsRef.current.slice(0, next);
    if (trimmed.length !== allowedLangsRef.current.length) {
      allowedLangsRef.current = trimmed;
      setAllowedLangs(trimmed);
      localStorage.setItem(LS_ALLOWED, JSON.stringify(trimmed));
      publishConfig(trimmed, next);
    } else {
      publishConfig(allowedLangsRef.current, next);
    }
  };

  const supportedLangs = LANGUAGES.filter((l) => l.code !== "auto");

  return (
    <GlassCard glow="purple" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-primary">
            Viewer Languages
          </h2>
          <p className="mt-0.5 text-[11px] text-tertiary">
            {allowedLangs.length > 0
              ? `${allowedLangs.length} of ${maxCount} selected`
              : "No languages — viewers see Follow Host only"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-[11px] font-medium text-tertiary">Max:</span>
          <input
            type="number"
            min={1}
            max={20}
            value={maxCount}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) handleMaxChange(v);
            }}
            className="focus-ring h-8 w-12 rounded-lg border border-app bg-[var(--surface)] px-1.5 text-center text-[12px] font-medium text-primary outline-none"
          />
        </div>
      </div>

      <div className="thin-scrollbar flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pr-0.5">
        {supportedLangs.map((l) => {
          const isSelected = allowedLangs.includes(l.code);
          const isDisabled = !isSelected && allowedLangs.length >= maxCount;
          return (
            <button
              key={l.code}
              onClick={() => !isDisabled && toggleLang(l.code)}
              title={isDisabled ? `Max ${maxCount} languages reached` : l.name}
              className={`flex select-none items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                isSelected
                  ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-400/40 dark:bg-brand-500/15 dark:text-brand-200"
                  : isDisabled
                    ? "cursor-not-allowed border-app bg-[var(--surface-2)] text-[var(--muted)]"
                    : "cursor-pointer border-app bg-[var(--surface)] text-secondary hover:border-[var(--border-strong)]"
              }`}
            >
              <span>{l.flag}</span>
              <span>{l.name}</span>
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}
