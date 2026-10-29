import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Same-origin proxy: the SameSite=Strict session cookie works and the browser never sees Orthanc.
export default defineConfig({
  base: "/genusvisualizador/", // served by the web-laudos API under this prefix
  plugins: [react()],
  cacheDir: "node_modules/.vite-view", // fresh dir: the default one was left locked by a dev server on Windows
  // dcmjs -> xmlbuilder2 imports Node's "events"; use the browser-compatible package instead
  resolve: { alias: { events: "events/" } },
  // the loader spawns its decode worker via new URL(..., import.meta.url), which breaks when pre-bundled
  optimizeDeps: {
    exclude: ["@cornerstonejs/dicom-image-loader"],
    // CJS codecs/deps imported by the excluded loader still need pre-bundling; they are direct deps because pnpm is strict
    include: [
      "dicom-parser",
      "pako",
      "chai",
      "@cornerstonejs/codec-charls/decodewasmjs",
      "@cornerstonejs/codec-libjpeg-turbo-8bit/decodewasmjs",
      "@cornerstonejs/codec-libjxl/decodewasmjs",
      "@cornerstonejs/codec-openjpeg/decodewasmjs",
      "@cornerstonejs/codec-openjph/wasmjs",
    ],
    rolldownOptions: { resolve: { alias: { events: "events/" } } },
  },
  server: { proxy: { "/genusvisualizador/dicomweb": { target: process.env.DICOMWEB_TARGET ?? "http://127.0.0.1:3000", rewrite: (p) => p.replace("/genusvisualizador", "") } } },
  worker: { format: "es" },
});
