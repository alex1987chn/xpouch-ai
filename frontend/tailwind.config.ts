import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
      extend: {
      colors: {
        // 基础配色
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        sidebar: "hsl(var(--sidebar))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // 1. 糖果色系 (Vibe Palette)
        vibe: {
          bg: "#F8FAFC",
          sidebar: "#E5E7EB",
          accent: "#6366F1",
          glass: "rgba(255, 255, 255, 0.7)",
          // 光晕专用色
          glow: {
            purple: "#E9D5FF",
            blue: "#DBEAFE",
            mint: "#D1FAE5",
            orange: "#FFEDD5",
          }
        },
        cashmere: {
          page: 'var(--cashmere-page)',
          primary: 'var(--cashmere-primary)',
          hover: 'var(--cashmere-hover)',
          text: 'var(--cashmere-text)',
          muted: 'var(--cashmere-muted)',
          border: 'var(--cashmere-border)',
        },
        ai: {
          bg: { light: 'var(--ai-bg-light)', dark: 'var(--ai-bg-dark)' },
          primary: { light: 'var(--ai-primary-light)', dark: 'var(--ai-primary-dark)' },
          text: { light: 'var(--ai-text-light)', dark: 'var(--ai-text-dark)' },
          card: { light: 'var(--ai-card-light)', dark: 'var(--ai-card-dark)' }
        }
      },
      // 2. 输入框光晕的背景渐变
      backgroundImage: {
        'mesh-glow': "radial-gradient(at 20% 20%, #E9D5FF 0%, transparent 50%), radial-gradient(at 80% 10%, #DBEAFE 0%, transparent 50%), radial-gradient(at 50% 90%, #D1FAE5 0%, transparent 50%)",
      },
      borderRadius: {
        'ai': '1.25rem',
        'panel': '1.5rem',
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "vibe-pulse": {
          "0%, 100%": { opacity: "0.3", transform: "scale(1)" },
          "50%": { opacity: "0.5", transform: "scale(1.05)" },
        },
        "pulse-glow": {
          "0%, 100%": { 
            opacity: "1", 
            transform: "scale(1)",
            filter: "brightness(1)"
          },
          "50%": { 
            opacity: "0.9", 
            transform: "scale(1.08)",
            filter: "brightness(1.2)"
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "vibe-pulse": "vibe-pulse 12s infinite ease-in-out",
        "pulse-glow": "pulse-glow 0.8s ease-in-out infinite",
      },
      backdropBlur: {
        xl: "20px",
      }
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
