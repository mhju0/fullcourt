import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: false,
    // Half the cores, not one per core: at the default, a full run held the whole machine and
    // the `*-server.test.ts` cache tests timed out at 5s under their own suite's load.
    maxWorkers: "50%",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
