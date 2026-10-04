import { ReactNode } from "react";
import { clsx } from "clsx";

const V = {
  blue: "bg-brand-50 text-brand-700 border-brand-200",
  purple: "bg-signal-50 text-signal-700 border-signal-100",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};
const DOT = {
  blue: "bg-brand-500",
  purple: "bg-signal-500",
  emerald: "bg-emerald-500",
  red: "bg-rose-500",
  slate: "bg-slate-400",
};

export function Badge({
  children,
  variant = "slate",
  dot = false,
}: {
  children: ReactNode;
  variant?: keyof typeof V;
  dot?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        V[variant],
      )}
    >
      {dot && (
        <span
          className={clsx("size-1.5 rounded-full animate-pulse", DOT[variant])}
        />
      )}
      {children}
    </span>
  );
}
