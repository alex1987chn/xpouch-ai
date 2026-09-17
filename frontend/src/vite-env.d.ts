/// <reference types="vite/client" />

/**
 * 构建期注入的应用版本号（由 vite.config.ts 从 backend/pyproject.toml 读出，
 * 那是版本号的唯一真相源；不要在前端代码里再写一份）。
 */
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_API_TIMEOUT: string
  readonly VITE_ENABLE_TYPING_EFFECT: string
  readonly VITE_ENABLE_SOUND_EFFECTS: string
  readonly VITE_APP_ENV: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
