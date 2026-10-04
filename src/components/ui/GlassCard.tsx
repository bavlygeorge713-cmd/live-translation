import { ReactNode } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { clsx } from "clsx";

interface Props extends HTMLMotionProps<"div"> {
  children: ReactNode;
  glow?: "blue" | "purple" | "emerald" | "none";
  padding?: "none" | "sm" | "md";
}

const GLOW = {
  blue: "",
  purple: "",
  emerald: "",
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
        "rounded-2xl border border-app bg-[var(--surface)] shadow-soft",
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
