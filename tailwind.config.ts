import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        charcoal: {
          900: "#0d0d0f",
          800: "#111114",
          700: "#16161a",
        },
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
