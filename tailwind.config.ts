import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0B1220",
        paper: "#F7F8FC",
        surface: "#FFFFFF",
        border: "#E4E7F0",
        muted: "#6B7280",
        brand: {
          50: "#EEF4FF",
          100: "#DCE8FF",
          200: "#B4CCFF",
          300: "#84AAFF",
          400: "#4E7FFB",
          500: "#2A57E8",
          600: "#1D3FC0",
          700: "#172F93",
          800: "#132670",
          900: "#101F57",
        },
        amber: {
          400: "#F5A524",
          500: "#E2900F",
        },
        success: "#12805C",
        danger: "#C0362C",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,31,87,0.06), 0 8px 24px rgba(16,31,87,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
