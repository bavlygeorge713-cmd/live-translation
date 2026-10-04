// Shared presentational primitives for the redesigned pages
// (login, rooms, viewer). Styling only — no app logic lives here.
import { forwardRef, useState } from "react";
import { Captions, Eye, EyeOff } from "lucide-react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 shadow-sm">
        <Captions className="size-[19px] text-white" strokeWidth={2} />
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-white bg-emerald-400" />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-semibold tracking-[-0.015em] text-primary">
            Live Translation
          </div>
          <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-tertiary">
            Conference Intelligence
          </div>
        </div>
      )}
    </div>
  );
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export function RButton({
  children,
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const variants = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-700 border-transparent shadow-sm",
    secondary: "surface text-primary border-app hover:bg-[var(--surface-2)]",
    ghost:
      "bg-transparent text-secondary border-transparent hover:bg-[var(--surface-2)] hover:text-primary",
    danger:
      "bg-rose-600 text-white hover:bg-rose-700 border-transparent shadow-sm",
  };
  const sizes = {
    sm: "h-9 px-3 text-[13px]",
    md: "h-10 px-4 text-[14px]",
    lg: "h-12 px-5 text-[14px]",
  };
  return (
    <button
      type={type}
      className={cx(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-[10px] border font-semibold transition disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** Labelled text input. `type="password"` adds the show/hide eye toggle. */
export const RField = forwardRef<HTMLInputElement, FieldProps>(function RField(
  { label, type = "text", className, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <label className="block">
      <span className="mb-2 block text-[12px] font-semibold text-slate-700">
        {label}
      </span>
      <div className="relative">
        <input
          ref={ref}
          type={isPassword && visible ? "text" : type}
          className={cx(
            "focus-ring h-[46px] w-full rounded-[10px] border border-slate-300 bg-white pl-3.5 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-brand-500",
            isPassword ? "pr-11" : "pr-3.5",
            className,
          )}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
          >
            {visible ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        )}
      </div>
    </label>
  );
});
