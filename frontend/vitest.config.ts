import { defineConfig } from "vitest/config";
import path from "path";
import os from "os";
import { mkdtempSync } from "fs";

export default defineConfig({
  cacheDir: mkdtempSync(path.join(os.tmpdir(), "gheverhan-vitest-")),
  server: {
    host: "127.0.0.1",
    cors: false,
    hmr: false,
    fs: { strict: true },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    api: false,
    ui: false,
    // Vitest 2 requires a browser name even when Browser Mode is disabled.
    browser: { enabled: false, name: "chromium" },
    maxWorkers: 2,
    minWorkers: 1,
    pool: "forks",
    // Vitest 2 builds worker arguments independently of the parent process.
    poolOptions: { forks: { execArgv: ["--disable-proto=throw"] } },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
