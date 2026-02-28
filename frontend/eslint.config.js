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
      ...reactHooks.configs.recommended.rules,
      
      // React Refresh - 允许常量导出
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      
      // 未使用变量 - 允许以下划线开头的变量
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { 
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        }
      ],
      
      // any 类型 - 暂时设为警告（项目中存在大量 any 需要逐步修复）
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // 禁止 console - 设为警告（项目中有大量 console.log）
      'no-console': 'off',
      
      // 不必要的转义字符
      'no-useless-escape': 'warn',
      
      // 允许 require() (用于 tailwind.config.ts 等配置文件)
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
)
