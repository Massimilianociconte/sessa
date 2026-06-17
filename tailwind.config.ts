import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        terracotta: "#D65A1F",
        orangeSoft: "#E87732",
        cream: "#FFF7ED",
        ivory: "#FAF6EF",
        ink: "#171412",
        ceramic: "#1F4E79",
        majolica: "#F2B84B"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Manrope", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Cormorant Garamond", "Georgia", "serif"],
        script: ["var(--font-script)", "Allura", "cursive"]
      },
      boxShadow: {
        editorial: "0 28px 80px rgba(23, 20, 18, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
