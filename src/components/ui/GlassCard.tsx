import { ReactNode } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { clsx } from "clsx";

interface Props extends HTMLMotionProps<"div"> {
  children: ReactNode;
  glow?: "blue" | "purple" | "emerald" | "none";
  padding?: "none" | "sm" | "md";
}

const GLOW = {
  blue: "hover:shadow-[0_0_30px_rgba(59,130,246,0.12)] hover:border-blue-500/20",
  purple:
    "hover:shadow-[0_0_30px_rgba(139,92,246,0.12)] hover:border-violet-500/20",
  emerald:
    "hover:shadow-[0_0_30px_rgba(16,185,129,0.12)] hover:border-emerald-500/20",
  none: "",
};
const PAD = { none: "", sm: "p-3", md: "p-5" };

export function GlassCard({
  children,
  glow = "none",
  padding = "md",
  className,
  ...rest
}: Props) {
  return (
    <motion.div
      className={clsx(
        "rounded-2xl border border-white/[0.06] transition-all duration-300",
        "bg-[rgba(16,16,20,0.7)] backdrop-blur-xl",
        GLOW[glow],
        PAD[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
