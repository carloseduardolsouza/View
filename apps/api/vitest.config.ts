import { defineConfig } from "vitest/config";
// *.int.test.ts need the running API + DB: they have their own script (test:int)
export default defineConfig({ test: { exclude: ["**/node_modules/**", "**/*.int.test.ts"] } });
