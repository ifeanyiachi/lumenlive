import path from "path"
import os from "os"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
// `vitest/config` re-exports Vite's `defineConfig` with the `test` field typed;
// Vite itself ignores `test`, so this stays a valid Vite config for dev/build.
import { defineConfig } from "vitest/config"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: "build",
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        broadcast: path.resolve(__dirname, "broadcast-output.html"),
        overlay: path.resolve(__dirname, "web-overlay.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // Hardening against CPU contention (e.g. a concurrent `cargo build`). Two
    // knobs, both defence-in-depth on top of using static imports in the store
    // tests:
    //   - Widen the default 5s test/hook timeouts so heavy on-demand work under
    //     a starved CPU can't spuriously time out.
    //   - Cap the worker pool to leave one core free, so the runner doesn't
    //     oversubscribe every core against other work on the machine.
    testTimeout: 15000,
    hookTimeout: 15000,
    pool: "forks",
    maxWorkers: Math.max(1, os.cpus().length - 1),
  },
})
