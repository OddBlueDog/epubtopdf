import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      restoreMocks: true,
      coverage: {
        provider: "v8",
        include: ["src/core/**", "src/features/converter/{lib,model}/**"],
        exclude: ["**/*.test.ts", "src/core/pdf/pdfmake-runtime.ts"],
        reporter: ["text", "html"],
      },
    },
  }),
);
