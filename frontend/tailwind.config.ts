import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}", "./node_modules/streamdown/dist/*.js"],
  theme: {
    extend: {
      colors: {
        lilo: {
          50: "#eef6ff",
          100: "#d7e8ff",
          200: "#b6d2ff",
          300: "#84b3ff",
          400: "#4f8bff",
          500: "#2a67f5",
          600: "#1f4fda",
          700: "#1d3fb0",
          800: "#1f378a",
          900: "#1f326d"
        }
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        heading: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s ease-in-out infinite",
      },
    }
  },
  plugins: []
};

export default config;
