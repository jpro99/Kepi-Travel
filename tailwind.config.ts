import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "kepi-bg":       "var(--bg-base)",
        "kepi-card":     "var(--bg-card)",
        "kepi-muted":    "var(--bg-muted)",
        "kepi-text":     "var(--text-primary)",
        "kepi-secondary":"var(--text-secondary)",
        "kepi-hint":     "var(--text-muted)",
        "kepi-border":   "var(--border-default)",
        "kepi-brand":    "var(--brand)",
      },
    },
  },
};

export default config;
