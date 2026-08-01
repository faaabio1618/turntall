import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/video-utils.js",
        "src/ffmpeg-commands.js",
        "src/media-format.js",
        "src/subject-selection.js",
        "src/template-tracker.js",
        "src/crop-trajectory.js",
        "src/output-preview.js",
        "src/progress-estimate.js",
        "src/processing-steps.js",
        "src/conversion-progress.js",
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
