/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0e1210",
        surface: {
          DEFAULT: "#171d1a",
          2: "#1f2723",
        },
        fg: {
          DEFAULT: "#f2efe8",
          muted: "#9aa399",
          subtle: "#6d766f",
        },
        accent: {
          DEFAULT: "#c5cec6",
          fg: "#0e1210",
        },
        border: "rgba(242, 239, 232, 0.14)",
        ring: "#c5cec6",
      },
      fontFamily: {
        display: ["Fraunces", "Times New Roman", "serif"],
        sans: ["Outfit", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        display: "-0.03em",
      },
    },
  },
  plugins: [],
};
