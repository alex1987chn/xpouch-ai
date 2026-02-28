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
      // 这是 React 的底层物理法则，违反会导致难以排查的内存问题
      'react-hooks/rules-of-hooks': 'error',
      
      // exhaustive-deps: 保持为 warn，帮助发现 90% 的闭包陷阱
      // 如果报得不对，通常说明逻辑需要抽离成 useCallback/useMemo
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
      
      // 未使用变量 - 允许以下划线开头的变量（表示故意未使用）
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        }
      ],
      
      // any 类型 - 设为警告（项目中存在大量 any 需要逐步重构）
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // 空接口/对象类型 - 警告（通常可以用更精确的类型替代）
      '@typescript-eslint/no-empty-object-type': 'warn',
      
      // ============================================================================
      // JavaScript - 代码质量
      // ============================================================================
      
      // 禁止 console - 关闭（项目中有大量 console.log，需要逐步替换为 logger）
      'no-console': 'off',
      
      // 不必要的转义字符 - 警告（有些正则确实需要转义）
      'no-useless-escape': 'warn',
      
      // prefer-const - 错误（防止意外修改变量）
      'prefer-const': 'error',
      
      // ============================================================================
      // 配置文件例外
      // ============================================================================
      
      // 允许 require() (用于 tailwind.config.ts 等配置文件)
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  
  // ============================================================================
  // 配置文件特殊规则
  // ============================================================================
  {
    files: ['tailwind.config.ts', 'vite.config.ts', 'eslint.config.js'],
    rules: {
      // 配置文件中允许 require
      '@typescript-eslint/no-require-imports': 'off',
    }
  }
)
