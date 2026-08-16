import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist` is build output; `src-tauri` holds Rust sources and its `target/`
  // build directory (codegen `.js` assets that aren't valid ESLint input).
  globalIgnores(['dist', 'src-tauri']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Allow omitting properties via rest destructuring (e.g. `const { x, ...rest } = o`)
      // and `_`-prefixed intentional throwaways.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // `convertFileSrc` throws outside a Tauri context; embedding its result
      // directly in `src`/`url` is also where the prod-only asset.localhost/CSP
      // bug bites. Route all path→URL conversion through `safeFileSrc`, which
      // centralizes both concerns. The wrapper itself is exempted below.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tauri-apps/api/core',
              importNames: ['convertFileSrc'],
              message:
                'Import { safeFileSrc } from "@/lib/media/safe-file-src" instead of using convertFileSrc directly.',
            },
            {
              // The raw broadcast transport must only be used by the
              // broadcast-content gateway (exempted below). Everyone else emits
              // through the gateway's typed emitters so the cross-window event
              // contract stays compiler-enforced.
              name: '@/lib/broadcast-routing',
              importNames: ['emitToOutput', 'emitToAllOutputs'],
              message:
                'Emit broadcast events via emitOutputEvent/broadcastOutputEvent from "@/services/broadcast-content-gateway" instead of the raw transport.',
            },
          ],
        },
      ],
    },
  },
  {
    // The single sanctioned wrapper around `convertFileSrc`.
    files: ['src/lib/media/safe-file-src.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // The single sanctioned consumer of the raw broadcast transport.
    files: ['src/services/broadcast-content-gateway.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
])
