import { defineConfig, type Plugin, type Connect } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { routeRequest } from "./scripts/site-routes.ts";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
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

function agentReadyRoutesPlugin(): Plugin {
  const middleware = (development: boolean): Connect.NextHandleFunction =>
    function agentReadyRoutes(request, response, next) {
      const url = new URL(request.url ?? "/", "http://localhost");
      // Vite-only modules are not public production routes.
      if (development && /^\/(?:@|__|src\/|node_modules\/)/.test(url.pathname)) {
        next();
        return;
      }
      const result = routeRequest({ request: {
        uri: url.pathname,
        method: request.method ?? "GET",
        headers: { accept: { value: request.headers.accept ?? "" } },
      } });
      response.setHeader("Vary", "Accept, Accept-Encoding");
      if ("statusCode" in result) {
        response.statusCode = result.statusCode;
        for (const [name, header] of Object.entries(result.headers)) response.setHeader(name, header.value);
        response.end(result.body);
        return;
      }
      request.url = result.uri + url.search;
      // Serve Markdown explicitly: static-server MIME tables differ by OS.
      const markdownPath = resolve(development ? "public" : "dist", "." + result.uri);
      if (result.uri.endsWith(".md") && existsSync(markdownPath)) {
        const body = readFileSync(markdownPath);
        response.setHeader("Content-Type", "text/markdown; charset=utf-8");
        response.setHeader("Content-Length", body.length);
        response.end(request.method === "HEAD" ? undefined : body);
        return;
      }
      next();
    };

  return {
    name: "agent-ready-routes",
    configureServer(server) {
      server.middlewares.use(middleware(true));
      return () => server.middlewares.use(notFound);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(false));
      return () => server.middlewares.use(notFound);
    },
  };
}

const notFound: Connect.NextHandleFunction = (request, response) => {
  response.statusCode = 404;
  response.setHeader("Content-Type", "text/markdown; charset=utf-8");
  response.end(request.method === "HEAD" ? undefined : readFileSync(resolve("public/404.md")));
};

function ffmpegCoreAssetsPlugin(): Plugin {
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
  appType: "mpa",
  plugins: [agentReadyRoutesPlugin(), svelte(), ffmpegCoreAssetsPlugin()],
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
