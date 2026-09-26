import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// Modul Node/Electron yang tidak boleh diimpor dari kode renderer maupun shared.
const nodeOnlyModules = {
  patterns: [
    {
      group: ['electron', 'electron/*', 'node:*', 'better-sqlite3', 'drizzle-orm', 'drizzle-orm/*'],
      message: 'Renderer and shared code must not import Node or Electron modules. Use window.api.',
    },
  ],
  paths: ['fs', 'path', 'os', 'child_process', 'crypto', 'url'].map((name) => ({
    name,
    message: 'Renderer and shared code must not import Node modules. Use window.api.',
  })),
}

export default defineConfig([
  globalIgnores(['out/**', 'dist/**', 'node_modules/**']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: [
      'src/main/**/*.ts',
      'src/preload/**/*.ts',
      '*.config.{ts,mjs}',
      'scripts/**/*.{js,mjs}',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended],
    rules: { 'no-restricted-imports': ['error', nodeOnlyModules] },
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', nodeOnlyModules] },
  },
  prettier,
])
