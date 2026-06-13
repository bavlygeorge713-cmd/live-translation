import { motion } from "framer-motion";
import { useAudioVisualizer } from "@/hooks/useAudioVisualizer";

const COLORS = {
  blue: { on: "#3b82f6", off: "#1e3a5f" },
  emerald: { on: "#10b981", off: "#134e3a" },
  purple: { on: "#8b5cf6", off: "#3b2d6f" },
};

export function AudioVisualizer({
  stream,
  isActive,
  color = "blue",
  bars = 24,
  height = 48,
}: {
  stream: MediaStream | null;
  isActive: boolean;
  color?: keyof typeof COLORS;
  bars?: number;
  height?: number;
}) {
  const data = useAudioVisualizer(isActive ? stream : null, bars);
  const { on, off } = COLORS[color];

  return (
    <div
      className="flex items-end justify-center gap-[3px]"
      style={{ height }}
      aria-hidden
    >
      {data.map((v, i) => (
        <motion.div
          key={i}
          animate={{
            height: Math.max(3, v * height),
            backgroundColor: isActive ? on : off,
          }}
          transition={{ duration: 0.06, ease: "linear" }}
          style={{ width: 3, borderRadius: 2 }}
        />
      ))}
    </div>
  );
}
