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
  primary: "bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-500 hover:to-violet-500 shadow-lg shadow-blue-900/30",
  secondary: "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10",
  danger: "bg-gradient-to-r from-red-600 to-rose-600 text-white hover:from-red-500 hover:to-rose-500",
  ghost: "text-slate-400 hover:text-slate-200 hover:bg-white/5",
  success: "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500",
};
const S = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2 text-sm gap-2 rounded-xl",
  lg: "px-5 py-2.5 text-sm gap-2 rounded-xl",
  icon: "p-2 rounded-lg",
};

export function Button({ variant = "secondary", size = "md", loading, children, className, disabled, ...rest }: Props) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      transition={{ duration: 0.1 }}
      className={clsx(
        "inline-flex items-center justify-center font-medium transition-all duration-200",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
        V[variant], S[size], className
      )}
      disabled={disabled || loading}
      {...(rest as any)}
    >
      {loading ? (
        <><span className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" /> Processing…</>
      ) : children}
    </motion.button>
  );
}
