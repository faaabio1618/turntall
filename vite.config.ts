import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import {
  copyFileSync,
  createReadStream,
  mkdirSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ffmpegCoreDirectory = fileURLToPath(
  new URL("./node_modules/@ffmpeg/core/dist/esm/", import.meta.url),
);
const ffmpegCoreAssets = new Map([
  ["ffmpeg-core.js", "text/javascript; charset=utf-8"],
  ["ffmpeg-core.wasm", "application/wasm"],
]);

function ffmpegCoreAssetsPlugin() {
  return {
    name: "ffmpeg-core-assets",
    configureServer(server) {
      server.middlewares.use("/ffmpeg", (request, response, next) => {
        const assetName = new URL(
          request.url ?? "/",
          "http://localhost",
        ).pathname.slice(1);
        const contentType = ffmpegCoreAssets.get(assetName);

        if (!contentType) {
          next();
          return;
        }

        const assetPath = resolve(ffmpegCoreDirectory, assetName);
        response.statusCode = 200;
        response.setHeader("Content-Type", contentType);
        response.setHeader("Content-Length", statSync(assetPath).size);
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        createReadStream(assetPath).pipe(response);
      });
    },
    writeBundle(outputOptions) {
      const outputDirectory = resolve(outputOptions.dir ?? "dist", "ffmpeg");
      mkdirSync(outputDirectory, { recursive: true });

      for (const assetName of ffmpegCoreAssets.keys()) {
        copyFileSync(
          resolve(ffmpegCoreDirectory, assetName),
          resolve(outputDirectory, assetName),
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [svelte(), ffmpegCoreAssetsPlugin()],
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
});
