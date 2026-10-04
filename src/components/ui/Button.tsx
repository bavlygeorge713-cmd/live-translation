import { ButtonHTMLAttributes, ReactNode } from "react";
import { motion } from "framer-motion";
import { clsx } from "clsx";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md" | "lg" | "icon";
  loading?: boolean;
  children: ReactNode;
}

const V = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary:
    "bg-[var(--surface)] border border-app text-primary hover:bg-[var(--surface-2)]",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm",
  ghost: "text-secondary hover:text-primary hover:bg-[var(--surface-2)]",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm",
};
const S = {
  sm: "h-9 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-[14px] gap-2 rounded-[10px]",
  lg: "h-12 px-5 text-[14px] gap-2 rounded-[10px]",
  icon: "p-2 rounded-[10px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  children,
  className,
  disabled,
  ...rest
}: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      transition={{ duration: 0.1 }}
      className={clsx(
        "focus-ring inline-flex items-center justify-center font-semibold transition-colors duration-200",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
        V[variant],
        S[size],
        className,
      )}
      disabled={disabled || loading}
      {...(rest as any)}
    >
      {loading ? (
        <>
          <span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />{" "}
          Processing…
        </>
      ) : (
        children
      )}
    </motion.button>
  );
}
