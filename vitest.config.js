import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/browser-support.js",
        "src/conversion-progress.js",
        "src/crop-trajectory.js",
        "src/editing-modes.js",
        "src/editor-history.js",
        "src/ffmpeg-commands.js",
        "src/media-format.js",
        "src/media-frame-scheduler.js",
        "src/optical-flow-tracker.js",
        "src/output-preview.js",
        "src/processing-steps.js",
        "src/progress-estimate.js",
        "src/scene-change.js",
        "src/selection-summary.js",
        "src/streaming-media.js",
        "src/subject-selection.js",
        "src/template-tracker.js",
        "src/video-utils.js",
        "src/webcodecs-editor.js",
      ],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
