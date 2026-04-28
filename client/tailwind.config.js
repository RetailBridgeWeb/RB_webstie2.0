/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#E55125",
          navy: "#0A1727",
          grey: "#68717A",
          sand: "#F4EEE9",
          ink: "#111827",
        },
      },
      fontFamily: {
        sans: ["Noto Sans Arabic", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 20px 45px rgba(10, 23, 39, 0.08)",
        glow: "0 18px 40px rgba(229, 81, 37, 0.18)",
      },
    },
  },
  plugins: [],
};
