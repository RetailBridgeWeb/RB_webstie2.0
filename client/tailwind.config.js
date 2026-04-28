/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#E55125",
          navy: "#0A1727",
          grey: "#6B717A",
          sand: "#F4EEE9",
          light: "#E7E7E9",
          ink: "#111827",
          mist: "#EDF2F7",
          border: "#D8E0E8",
          surface: "#FFFFFF",
          soft: "#F8FAFC",
          success: "#0F766E",
          warning: "#B45309",
          danger: "#BE123C",
        },
      },
      fontFamily: {
        sans: ["Noto Sans Arabic", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.1rem",
        xl3: "1.5rem",
      },
      boxShadow: {
        panel: "0 20px 45px rgba(10, 23, 39, 0.08)",
        glow: "0 18px 40px rgba(229, 81, 37, 0.18)",
        soft: "0 12px 30px rgba(10, 23, 39, 0.06)",
      },
    },
  },
  plugins: [],
};
