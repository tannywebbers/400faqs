import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#2ECC71",
          50: "#EEFBF3",
          100: "#D9F6E5",
          200: "#B3EDCB",
          300: "#85E1AB",
          400: "#55D389",
          500: "#2ECC71",
          600: "#25A860",
          700: "#1F8A50",
          800: "#1A6E42",
          900: "#155636",
        },
        brand: {
          DEFAULT: "#2F80ED",
          50: "#EAF2FE",
          100: "#D3E4FD",
          200: "#A7C9FB",
          300: "#7BACF8",
          400: "#4F90F4",
          500: "#2F80ED",
          600: "#1F6AC7",
          700: "#1955A1",
          800: "#14427C",
          900: "#103258",
        },
        accent: {
          DEFAULT: "#F2994A",
          50: "#FEF5EC",
          100: "#FCE8D4",
          200: "#F8CFA5",
          300: "#F5B677",
          400: "#F29E52",
          500: "#F2994A",
          600: "#E07F2B",
          700: "#BC6720",
          800: "#97511A",
          900: "#753F15",
        },
        surface: "#F8FAFC",
        ink: "#1F2937",
        line: "#E5E7EB",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
        // Product requirement: EVERY input field and button uses this radius.
        control: "30px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(31, 41, 55, 0.08)",
        "glass-lg": "0 16px 48px rgba(31, 41, 55, 0.12)",
        soft: "0 2px 8px rgba(31, 41, 55, 0.05)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #2ECC71 0%, #2F80ED 100%)",
        "gradient-warm": "linear-gradient(135deg, #F2994A 0%, #EB5757 100%)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.5s ease-out both",
        shimmer: "shimmer 1.5s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
