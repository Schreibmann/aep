import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // better-sqlite3 is a native addon; keep a single fork (Vitest 4+ pool API).
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
  },
});
