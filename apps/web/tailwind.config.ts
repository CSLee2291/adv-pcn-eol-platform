import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#4461EC",
          600: "#3652D9",
          700: "#2D45B8",
          800: "#263C94",
          900: "#1E2F72",
        },
        secondary: {
          50: "#FDF2F8",
          100: "#FCE7F3",
          200: "#FBCFE8",
          300: "#F9A8D4",
          400: "#F472B6",
          500: "#EC4899",
          600: "#DB2777",
          700: "#BE185D",
          800: "#9D174D",
          900: "#831843",
        },
        neutral: {
          25: "#FCFCFD",
          50: "#F8F9FB",
          100: "#F1F3F5",
          150: "#E9ECF1",
          200: "#DFE3EA",
          300: "#C7CDD8",
          400: "#A6AFBC",
          500: "#7C8695",
          600: "#5E6775",
          700: "#434955",
          800: "#2A3039",
          900: "#171B22",
          950: "#0F1216",
        },
        success: { DEFAULT: "#22C55E", soft: "#86EFAC" },
        warning: { DEFAULT: "#F59E0B" },
        danger: { DEFAULT: "#EF4444" },
        info: { DEFAULT: "#5498F4" },
        lavender: { DEFAULT: "#A4A8E1" },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      fontSize: {
        kpi: ["2.25rem", { lineHeight: "2.5rem", fontWeight: "600" }],
        title: ["1.375rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        tab: ["1.125rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        nav: ["0.9375rem", { lineHeight: "1.25rem", fontWeight: "500" }],
        body: ["0.875rem", { lineHeight: "1.25rem", fontWeight: "400" }],
        meta: ["0.8125rem", { lineHeight: "1rem", fontWeight: "400" }],
        axis: ["0.75rem", { lineHeight: "1rem", fontWeight: "400" }],
      },
      borderRadius: {
        window: "1.5rem",
        card: "1.25rem",
        panel: "1rem",
        input: "0.875rem",
        chip: "0.625rem",
        pill: "9999px",
      },
      boxShadow: {
        "window-light":
          "0 24px 80px rgba(15,18,22,0.10), 0 8px 24px rgba(15,18,22,0.06)",
        "card-light": "0 6px 20px rgba(15,18,22,0.04)",
        "window-dark":
          "0 24px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)",
        "card-dark": "0 8px 24px rgba(0,0,0,0.18)",
      },
      spacing: {
        "4.5": "1.125rem",
        "5.5": "1.375rem",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
