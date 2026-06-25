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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">
            Viewer Languages
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {allowedLangs.length > 0
              ? `${allowedLangs.length} of ${maxCount} selected`
              : "No languages — viewers see Follow Host only"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-600">Max:</span>
          <input
            type="number"
            min={1}
            max={20}
            value={maxCount}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) handleMaxChange(v);
            }}
            className="w-10 bg-white/5 border border-white/10 text-slate-300 text-xs rounded px-1.5 py-1 outline-none focus:border-violet-500/40 text-center"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-0.5">
        {supportedLangs.map((l) => {
          const isSelected = allowedLangs.includes(l.code);
          const isDisabled = !isSelected && allowedLangs.length >= maxCount;
          return (
            <button
              key={l.code}
              onClick={() => !isDisabled && toggleLang(l.code)}
              title={isDisabled ? `Max ${maxCount} languages reached` : l.name}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border transition-colors select-none ${
                isSelected
                  ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                  : isDisabled
                    ? "bg-white/[0.02] border-white/5 text-slate-700 cursor-not-allowed"
                    : "bg-white/5 border-white/10 text-slate-400 hover:border-white/20 cursor-pointer"
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
