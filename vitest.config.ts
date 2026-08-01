import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/platform/browser-support.ts",
        "src/processing/conversion-progress.ts",
        "src/tracking/crop-trajectory.ts",
        "src/editor/editing-modes.ts",
        "src/editor/editor-history.ts",
        "src/processing/ffmpeg-commands.ts",
        "src/media/media-format.ts",
        "src/media/media-frame-scheduler.ts",
        "src/tracking/optical-flow-tracker.ts",
        "src/editor/output-preview.ts",
        "src/processing/processing-steps.ts",
        "src/processing/progress-estimate.ts",
        "src/tracking/scene-change.ts",
        "src/editor/selection-summary.ts",
        "src/media/streaming-media.ts",
        "src/tracking/subject-selection.ts",
        "src/tracking/template-tracker.ts",
        "src/media/video-utils.ts",
        "src/processing/webcodecs-editor.ts",
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
