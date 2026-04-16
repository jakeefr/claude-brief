import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ["better-sqlite3", "ink", "ink-gradient", "ink-select-input", "ink-spinner", "ink-text-input", "react", "react-devtools-core"],
  noExternal: [],
  esbuildOptions(options) {
    options.jsx = "automatic";
  },
});
