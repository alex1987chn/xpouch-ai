import type { Config } from "tailwindcss"

const config: Config = {
  // 暗黑模式：使用 class 策略（通过 data-theme="dark" 控制）
  darkMode: ["class"],
  
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
      /* ============================================
         字体配置
         ============================================ */
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },

      /* ============================================
         语义化颜色系统
         所有颜色使用 RGB + <alpha-value> 格式
         支持透明度修饰符（如 bg-surface-card/50）
         ============================================ */
      colors: {
        /* ------------------------------------------
           Surface - 表面层级
           ------------------------------------------ */
        surface: {
          page: "rgb(var(--surface-page) / <alpha-value>)",
          card: "rgb(var(--surface-card) / <alpha-value>)",
          elevated: "rgb(var(--surface-elevated) / <alpha-value>)",
          input: "rgb(var(--surface-input) / <alpha-value>)",
          overlay: "rgb(var(--surface-overlay) / <alpha-value>)",
          scrim: "rgb(var(--surface-scrim) / <alpha-value>)",
        },

        /* ------------------------------------------
           Content - 内容颜色（文字、图标）
           ------------------------------------------ */
        content: {
          DEFAULT: "rgb(var(--content-primary) / <alpha-value>)",
          primary: "rgb(var(--content-primary) / <alpha-value>)",
          secondary: "rgb(var(--content-secondary) / <alpha-value>)",
          muted: "rgb(var(--content-muted) / <alpha-value>)",
          inverted: "rgb(var(--content-inverted) / <alpha-value>)",
          disabled: "rgb(var(--content-disabled) / <alpha-value>)",
        },

        /* ------------------------------------------
           Border - 边框颜色
           ------------------------------------------ */
        border: {
          DEFAULT: "rgb(var(--border-default) / <alpha-value>)",
          default: "rgb(var(--border-default) / <alpha-value>)",
          hover: "rgb(var(--border-hover) / <alpha-value>)",
          focus: "rgb(var(--border-focus) / <alpha-value>)",
          divider: "rgb(var(--border-divider) / <alpha-value>)",
          disabled: "rgb(var(--border-disabled) / <alpha-value>)",
        },

        /* ------------------------------------------
           Accent - 强调色（品牌、状态）
           ------------------------------------------ */
        accent: {
          DEFAULT: "rgb(var(--accent-brand) / <alpha-value>)",
          brand: "rgb(var(--accent-brand) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          active: "rgb(var(--accent-active) / <alpha-value>)",
          subtle: "rgb(var(--accent-subtle) / <alpha-value>)",
          destructive: "rgb(var(--accent-destructive) / <alpha-value>)",
          success: "rgb(var(--accent-success) / <alpha-value>)",
          warning: "rgb(var(--accent-warning) / <alpha-value>)",
          info: "rgb(var(--accent-info) / <alpha-value>)",
        },

        /* ------------------------------------------
           Shadow - 阴影颜色
           ------------------------------------------ */
        shadow: {
          color: "rgb(var(--shadow-color) / <alpha-value>)",
        },

        /* ============================================
           Shadcn UI 兼容变量
           保持与 shadcn/ui 组件库兼容
           ============================================ */
        background: "rgb(var(--surface-page) / <alpha-value>)",
        foreground: "rgb(var(--content-primary) / <alpha-value>)",
        
        primary: {
          DEFAULT: "rgb(var(--accent-brand) / <alpha-value>)",
          foreground: "rgb(var(--content-inverted) / <alpha-value>)",
        },
        
        secondary: {
          DEFAULT: "rgb(var(--surface-elevated) / <alpha-value>)",
          foreground: "rgb(var(--content-primary) / <alpha-value>)",
        },
        
        destructive: {
          DEFAULT: "rgb(var(--accent-destructive) / <alpha-value>)",
          foreground: "rgb(var(--content-inverted) / <alpha-value>)",
        },
        
        muted: {
          DEFAULT: "rgb(var(--surface-elevated) / <alpha-value>)",
          foreground: "rgb(var(--content-muted) / <alpha-value>)",
        },
        
        popover: {
          DEFAULT: "rgb(var(--surface-card) / <alpha-value>)",
          foreground: "rgb(var(--content-primary) / <alpha-value>)",
        },
        
        card: {
          DEFAULT: "rgb(var(--surface-card) / <alpha-value>)",
          foreground: "rgb(var(--content-primary) / <alpha-value>)",
        },

        input: "rgb(var(--surface-input) / <alpha-value>)",
        ring: "rgb(var(--accent-brand) / <alpha-value>)",

        /* ============================================
           旧变量兼容（迁移期后删除）
           ============================================ */
        bauhaus: {
          bg: "rgb(var(--surface-page) / <alpha-value>)",
          card: "rgb(var(--surface-card) / <alpha-value>)",
          border: "rgb(var(--border-default) / <alpha-value>)",
          text: "rgb(var(--content-primary) / <alpha-value>)",
          shadow: "rgb(var(--shadow-color) / <alpha-value>)",
          muted: "rgb(var(--content-muted) / <alpha-value>)",
          yellow: "rgb(var(--accent-brand) / <alpha-value>)",
          blue: "rgb(var(--accent-info) / <alpha-value>)",
          red: "rgb(var(--accent-destructive) / <alpha-value>)",
        },
      },

      /* ============================================
         圆角 - 使用 CSS 变量控制
         ============================================ */
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        xl: "var(--radius-xl)",
        none: "0",
        full: "9999px",
        // 旧兼容
        'ai': '1.25rem',
        'panel': '1.5rem',
        'bauhaus': '0',
      },

      /* ============================================
         阴影系统
         ============================================ */
      boxShadow: {
        // 标准阴影
        'sm': '0 1px 2px 0 rgb(var(--shadow-color) / 0.05)',
        'DEFAULT': '0 1px 3px 0 rgb(var(--shadow-color) / 0.1), 0 1px 2px -1px rgb(var(--shadow-color) / 0.1)',
        'md': '0 4px 6px -1px rgb(var(--shadow-color) / 0.1), 0 2px 4px -2px rgb(var(--shadow-color) / 0.1)',
        'lg': '0 10px 15px -3px rgb(var(--shadow-color) / 0.1), 0 4px 6px -4px rgb(var(--shadow-color) / 0.1)',
        'xl': '0 20px 25px -5px rgb(var(--shadow-color) / 0.1), 0 8px 10px -6px rgb(var(--shadow-color) / 0.1)',
        
        // Bauhaus 硬阴影
        'hard': '4px 4px 0 0 rgb(var(--shadow-color))',
        'hard-sm': '2px 2px 0 0 rgb(var(--shadow-color))',
        'hard-md': '4px 4px 0 0 rgb(var(--shadow-color))',
        'hard-lg': '6px 6px 0 0 rgb(var(--shadow-color))',
        'hard-xl': '8px 8px 0 0 rgb(var(--shadow-color))',
        
        // 霓虹发光（赛博朋克）
        'glow': '0 0 10px rgb(var(--accent-brand)), 0 0 20px rgb(var(--accent-brand))',
        'glow-sm': '0 0 5px rgb(var(--accent-brand))',
        'glow-lg': '0 0 20px rgb(var(--accent-brand)), 0 0 40px rgb(var(--accent-brand))',
      },

      /* ============================================
         动画
         ============================================ */
      transitionDuration: {
        'instant': '0ms',
        'fast': '100ms',
        'normal': '200ms',
        'slow': '300ms',
        'slower': '500ms',
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
          "0%, 100%": { opacity: "1", transform: "scale(1)", filter: "brightness(1)" },
          "50%": { opacity: "0.9", transform: "scale(1.08)", filter: "brightness(1.2)" },
        },
        // Bauhaus 按下动画
        "bauhaus-press": {
          "0%": { transform: "translate(0, 0)", boxShadow: "4px 4px 0 0 rgb(var(--shadow-color))" },
          "100%": { transform: "translate(2px, 2px)", boxShadow: "0 0 0 0 rgb(var(--shadow-color))" },
        },
        // 工业总线流动
        "bus-flow": {
          "0%, 100%": { transform: "translateY(-100%)", opacity: "0" },
          "10%": { opacity: "0.8" },
          "90%": { opacity: "0.8" },
          "100%": { transform: "translateY(100%)", opacity: "0" },
        },
        // 霓虹闪烁（赛博朋克）
        "neon-flicker": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.8" },
          "52%": { opacity: "0.2" },
          "54%": { opacity: "1" },
        },
      },
      
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 0.8s ease-in-out infinite",
        "bauhaus-press": "bauhaus-press 0.1s ease-out forwards",
        "bus-flow": "bus-flow 2s ease-in-out infinite",
        "neon-flicker": "neon-flicker 3s ease-in-out infinite",
      },

      /* ============================================
         背景图案
         ============================================ */
      backgroundImage: {
        'grid': "linear-gradient(to right, rgb(var(--border-divider) / 0.5) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--border-divider) / 0.5) 1px, transparent 1px)",
        'noise': "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22 opacity=%220.05%22/%3E%3C/svg%3E')",
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
  
  plugins: [
    require("tailwindcss-animate"), 
    require("@tailwindcss/typography")
  ],
}

export default config
