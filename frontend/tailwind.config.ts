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
      // 字体配置 - 来自 HTML
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
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
        // ============================================
        // NEO-BRUTALISM THEME SYSTEM
        // ============================================
        panel: {
          DEFAULT: "var(--bg-panel)",
        },
        inverted: {
          DEFAULT: "var(--text-inverted)",
        },
        // ============================================
        // BAUHAUS DESIGN SYSTEM - 包豪斯设计系统
        // ============================================
        bauhaus: {
          bg: 'var(--bauhaus-bg)',
          card: 'var(--bauhaus-card)',
          border: 'var(--bauhaus-border)',
          text: 'var(--bauhaus-text)',
          shadow: 'var(--bauhaus-shadow)',
          muted: 'var(--bauhaus-muted)',
          input: 'var(--bauhaus-input-bg)',
          yellow: 'var(--bauhaus-yellow)',
          blue: 'var(--bauhaus-blue)',
          red: 'var(--bauhaus-red)',
        }
      },
      // Bauhaus Box Shadow - 硬阴影系统 (来自 HTML)
      boxShadow: {
        'hard': '6px 6px 0px 0px var(--shadow-color)',
        'hard-lg': '10px 10px 0px 0px var(--shadow-color)',
        'hard-hover': '12px 12px 0px 0px var(--accent-hover)',
        'hard-sm': '4px 4px 0px 0px var(--shadow-color)',
        'hard-md': '6px 6px 0px 0px var(--shadow-color)',
        'hard-xl': '8px 8px 0px 0px var(--shadow-color)',
      },
      // 背景图案
      backgroundImage: {
        // 噪点纹理 - 来自 HTML
        'noise': "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22 opacity=%220.05%22/%3E%3C/svg%3E')",
      },
      borderRadius: {
        'ai': '1.25rem',
        'panel': '1.5rem',
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        'bauhaus': '0',
      },
      // Bauhaus Border Width - 粗边框系统
      borderWidth: {
        '3': '3px',
        '4': '4px',
        'bauhaus': '2px',
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
        // Bauhaus Animations
        "bauhaus-press": {
          "0%": { transform: "translate(0, 0)", boxShadow: "4px 4px 0 0 var(--bauhaus-shadow)" },
          "100%": { transform: "translate(2px, 2px)", boxShadow: "2px 2px 0 0 var(--bauhaus-shadow)" },
        },
        "bauhaus-float": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "50%": { transform: "translate(-2px, -2px)" },
        },
        // Industrial Bus Flow Animation
        "bus-flow": {
          "0%, 100%": { transform: "translateY(-100%)", opacity: "0" },
          "10%": { opacity: "0.8" },
          "90%": { opacity: "0.8" },
          "100%": { transform: "translateY(100%)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 0.8s ease-in-out infinite",
        "bauhaus-press": "bauhaus-press 0.1s ease-out forwards",
        "bauhaus-float": "bauhaus-float 0.3s ease-out",
        "bus-flow": "bus-flow 2s ease-in-out infinite",
      },
      backdropBlur: {
        xl: "20px",
      },
      scrollbarGutter: {
        stable: "stable",
        "stable-both-edges": "stable both-edges",
      }
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}

export default config
