import { describe, expect, it } from "vitest";
import {
  MAX_WASM_INPUT_BYTES,
  MEDIA_LOADING_STRATEGY,
  containerNamesForFilename,
  mediaLoadingStrategy,
  requiresStreamingInput,
} from "../src/streaming-media.js";

describe("large media routing", () => {
  it("keeps ordinary files on the wasm path", () => {
    expect(requiresStreamingInput(MAX_WASM_INPUT_BYTES)).toBe(false);
    expect(mediaLoadingStrategy(MAX_WASM_INPUT_BYTES)).toBe(
      MEDIA_LOADING_STRATEGY.MEMORY,
    );
  });

  it("routes files above the safe wasm limit to streaming", () => {
    expect(requiresStreamingInput(MAX_WASM_INPUT_BYTES + 1)).toBe(true);
    expect(requiresStreamingInput(3_801_950_475)).toBe(true);
    expect(mediaLoadingStrategy(3_801_950_475)).toBe(
      MEDIA_LOADING_STRATEGY.STREAMING,
    );
  });

  it("maps common file extensions to ffmpeg-style container names", () => {
    expect(containerNamesForFilename("BIGFILE.MP4")).toEqual([
      "mov",
      "mp4",
    ]);
    expect(containerNamesForFilename("clip.webm")).toEqual([
      "matroska",
      "webm",
    ]);
  });
});
