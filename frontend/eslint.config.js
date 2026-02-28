import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // ============================================================================
      // React Hooks - 严格模式（防止严重 Bug）
      // ============================================================================
      
      // rules-of-hooks: 必须是 error，防止 Hook 调用顺序错误
      'react-hooks/rules-of-hooks': 'error',
      
      // exhaustive-deps: 保持为 warn，帮助发现 90% 的闭包陷阱
      'react-hooks/exhaustive-deps': 'warn',
      
      // ============================================================================
      // React Refresh
      // ============================================================================
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      
      // ============================================================================
      // TypeScript - 类型安全
      // ============================================================================
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        }
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      
      // ============================================================================
      // JavaScript - 代码质量
      // ============================================================================
      'no-console': 'off',
      'no-useless-escape': 'warn',
      'prefer-const': 'error',
      
      // ============================================================================
      // THEME SYSTEM - 主题系统规范（新增）
      // ============================================================================
      
      /**
       * 🚫 禁止 dark: 前缀（强制使用语义变量）
       * 
       * 原因：
       * 1. dark: 是二极管逻辑，无法支持第三个主题
       * 2. 语义变量（如 bg-surface-card）自动适应所有主题
       * 
       * 错误：className="bg-white dark:bg-black"
       * 正确：className="bg-surface-card"
       */
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/\\bdark:/]',
          message: '🎨 禁止使用 dark: 前缀。请使用语义变量（如 bg-surface-card, text-content-primary）代替，以支持多主题系统。参考：src/styles/tokens/_semantic.css'
        }
      ],
      
      // ============================================================================
      // COLOR SYSTEM - 颜色系统规范（新增）
      // ============================================================================
      
      /**
       * 🚫 禁止硬编码 Tailwind 颜色（特定值）
       * 
       * 这些颜色值应该通过 CSS 变量控制，而不是硬编码
       * 
       * 错误：className="text-slate-400"
       * 正确：className="text-content-muted"
       * 
       * 例外：
       * - accent-brand 相关的具体色值（主题定义的一部分）
       * - 透明度和修饰符（如 /50, /hover）
       */
      'no-restricted-properties': [
        'warn',
        {
          object: 'className',
          property: 'value',
          message: '考虑使用语义变量代替硬编码颜色'
        }
      ],
      
      // ============================================================================
      // NAMING CONVENTIONS - 命名规范（新增）
      // ============================================================================
      
      /**
       * 语义变量命名检查（通过注释提示）
       * 
       * 建议的命名模式：
       * - Surface: bg-surface-{page|card|elevated|input|overlay}
       * - Content: text-content-{primary|secondary|muted|inverted}
       * - Border: border-{default|hover|focus|divider}
       * - Accent: {bg|text}-accent-{brand|hover|active|destructive}
       * 
       * 反模式（警告）：
       * - text-gray-*, bg-slate-*（硬编码颜色）
       * - dark:text-*（主题前缀）
       */
      
      // ============================================================================
      // CSS VARIABLES - CSS 变量规范（新增）
      // ============================================================================
      
      /**
       * 🚫 禁止在组件中定义 CSS 变量
       * 
       * 所有 CSS 变量应该在 src/styles/tokens/ 中定义
       * 组件只使用 var(--*) 引用，不定义新的变量
       * 
       * 错误：style={{ '--custom-color': 'red' }}
       * 正确：使用已有的语义变量 className="text-accent-destructive"
       */
      
      // ============================================================================
      // COMPONENT PATTERNS - 组件模式规范（新增）
      // ============================================================================
      
      /**
       * 主题无关组件要求
       * 
       * 所有 UI 组件（components/ui/*）必须：
       * 1. 不使用 dark: 前缀
       * 2. 不使用硬编码颜色（slate/gray/zinc 等）
       * 3. 只使用语义变量（surface/content/border/accent）
       * 
       * 这样组件在任何主题下都能正常工作
       */
    },
  },
  
  // ============================================================================
  // 配置文件特殊规则
  // ============================================================================
  {
    files: ['tailwind.config.ts', 'vite.config.ts', 'eslint.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      // 配置文件中允许使用颜色值（因为需要定义映射）
      'no-restricted-syntax': 'off',
    }
  },
  
  // ============================================================================
  // 主题文件例外（允许定义 CSS 变量）
  // ============================================================================
  {
    files: ['src/styles/**/*.css', 'src/**/*.css'],
    rules: {
      // CSS 文件中允许任何语法
      'no-restricted-syntax': 'off',
    }
  },
  
  // ============================================================================
  // 遗留代码例外（逐步迁移）
  // ============================================================================
  {
    files: [
      'src/components/artifacts/*.tsx',
      'src/pages/**/*.tsx',
    ],
    rules: {
      // 这些文件正在迁移中，暂时允许 dark:
      // TODO: 迁移完成后移除这些例外
      'no-restricted-syntax': 'warn',
    }
  }
)
