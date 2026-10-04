import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        captions: ["Noto Sans", "Noto Sans Arabic", "sans-serif"],
      },
      colors: {
        charcoal: {
          900: "#0d0d0f",
          800: "#111114",
          700: "#16161a",
        },
        brand: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
        },
        signal: {
          50: "#F0FDFA",
          100: "#CCFBF1",
          500: "#14B8A6",
          600: "#0D9488",
          700: "#0F766E",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16,24,40,.04), 0 2px 8px rgba(16,24,40,.04)",
        popover: "0 8px 24px rgba(15,23,42,.10), 0 2px 6px rgba(15,23,42,.05)",
        modal: "0 20px 60px rgba(15,23,42,.18)",
      },
      animation: {
        "record-pulse": "recordPulse 1.5s ease-in-out infinite",
      },
      keyframes: {
        recordPulse: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.15)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
