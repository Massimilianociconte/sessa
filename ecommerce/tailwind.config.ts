import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
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
        majolica: "#F2B84B",
        electric: "#073FD0",
        brilliant: "#08C963"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Manrope", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Cormorant Garamond", "Georgia", "serif"],
        script: ["var(--font-script)", "Allura", "cursive"]
      },
      boxShadow: {
        editorial: "0 28px 80px rgba(23, 20, 18, 0.14)",
        card: "0 10px 30px rgba(23, 20, 18, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
