import { ReactNode } from "react";
import { clsx } from "clsx";

const V = {
  blue:    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  purple:  "bg-violet-500/10 text-violet-400 border-violet-500/20",
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  red:     "bg-red-500/10 text-red-400 border-red-500/20",
  slate:   "bg-slate-500/10 text-slate-400 border-slate-500/20",
};
const DOT = { blue: "bg-blue-400", purple: "bg-violet-400", emerald: "bg-emerald-400", red: "bg-red-400", slate: "bg-slate-400" };

export function Badge({ children, variant = "slate", dot = false }: {
  children: ReactNode; variant?: keyof typeof V; dot?: boolean;
}) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", V[variant])}>
      {dot && <span className={clsx("size-1.5 rounded-full animate-pulse", DOT[variant])} />}
      {children}
    </span>
  );
}
