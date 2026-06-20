/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: false,
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page:       "#F4F5F7",
        card:       "#FFFFFF",
        accent:     "#F59E0B",
        "accent-h": "#D97706",
        "accent-l": "#FEF3C7",
        positive:   "#22C55E",
        "positive-l":"#ECFDF5",
        negative:   "#EF4444",
        "negative-l":"#FEF2F2",
        warning:    "#F59E0B",
        "warning-l":"#FFFBEB",
        "gray-950": "#0F1117",
        "gray-850": "#1A1D27",
        "gray-750": "#2D3039",
      },
      boxShadow: {
        "card":     "0 1px 4px rgba(0,0,0,0.06)",
        "card-hover":"0 4px 12px rgba(0,0,0,0.08)",
        "dropdown": "0 4px 16px rgba(0,0,0,0.10)",
        "tooltip":  "0 4px 12px rgba(0,0,0,0.15)",
      },
      borderRadius: {
        "card":  "14px",
        "card-lg": "16px",
        "pill":  "999px",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        vortice: ["vortice-concept", "sans-serif"],
      },
      fontSize: {
        "kpi":   ["2rem", { lineHeight: "1.2", fontWeight: "700" }],
        "kpi-sm":["1.5rem", { lineHeight: "1.2", fontWeight: "700" }],
        "label": ["0.6875rem", { lineHeight: "1", fontWeight: "600", letterSpacing: "0.08em" }],
      },
    },
  },
  plugins: [],
};
