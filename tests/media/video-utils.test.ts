import { describe, expect, it } from "vitest";
import {
  centeredVerticalSize,
  clamp,
  defaultOutputFilename,
  frameStepTime,
  formatBytes,
  formatTime,
  isKeyframeBoundary,
  keyframeBoundaries,
  nearestKeyframe,
  normalizeKeyframes,
  parseFramecrcKeyframes,
  sameDisplayedTime,
  spaceShortcutAction,
  suggestedTrackingFrameSkip,
} from "../../src/media/video-utils.ts";

describe("time and size formatting", () => {
  it("formats timestamps and clamps invalid negative input", () => {
    expect(formatTime(65.25)).toBe("01:05.25");
    expect(formatTime(-12)).toBe("00:00.00");
  });

  it("formats byte sizes with an appropriate unit", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("keeps the existing output naming convention", () => {
    expect(defaultOutputFilename("holiday.mov")).toBe(
      "holiday-cut.mp4",
    );
    expect(
      defaultOutputFilename("holiday.mov", {
        vertical: true,
        extension: "webm",
      }),
    ).toBe("holiday-vertical.webm");
  });

  it("clamps numeric and non-numeric values", () => {
    expect(clamp(12, 0, 10)).toBe(10);
    expect(clamp(-2, 0, 10)).toBe(0);
    expect(clamp("4.5", 0, 10)).toBe(4.5);
    expect(clamp("not-a-number", 2, 10)).toBe(2);
  });

  it("compares playhead times at the displayed centisecond precision", () => {
    expect(sameDisplayedTime(12.344, "12.34")).toBe(true);
    expect(sameDisplayedTime(12.346, "12.34")).toBe(false);
    expect(sameDisplayedTime(Number.NaN, "12.34")).toBe(false);
  });
});

describe("centered vertical crop sizing", () => {
  it("uses the complete source height for a horizontal video", () => {
    expect(centeredVerticalSize(2560, 1440)).toEqual({
      width: 810,
      height: 1440,
    });
  });

  it("keeps the crop inside an unusually narrow source", () => {
    expect(centeredVerticalSize(720, 1600)).toEqual({
      width: 720,
      height: 1280,
    });
  });

  it("returns encoder-safe even dimensions", () => {
    const crop = centeredVerticalSize(1921, 1081);
    expect(crop.width % 2).toBe(0);
    expect(crop.height % 2).toBe(0);
    expect(crop.width).toBeLessThanOrEqual(1921);
    expect(crop.height).toBeLessThanOrEqual(1081);
  });
});

describe("frame stepping", () => {
  it("moves by one frame using the detected frame rate", () => {
    expect(frameStepTime(2, 1, 25, 10)).toBeCloseTo(2.04);
    expect(frameStepTime(2, -1, 25, 10)).toBeCloseTo(1.96);
  });

  it("uses 30 fps as a fallback and stays inside the video", () => {
    expect(frameStepTime(0, -1, undefined, 10)).toBe(0);
    expect(frameStepTime(10, 1, 0, 10)).toBe(10);
    expect(frameStepTime(1, 0, 30, 10)).toBe(1);
  });
});

describe("tracking speed suggestion", () => {
  it("suggests 6× above 50 fps", () => {
    expect(suggestedTrackingFrameSkip(50.01)).toBe(6);
    expect(suggestedTrackingFrameSkip(60)).toBe(6);
  });

  it("keeps 1× at 50 fps or below", () => {
    expect(suggestedTrackingFrameSkip(50)).toBe(1);
    expect(suggestedTrackingFrameSkip(30)).toBe(1);
    expect(suggestedTrackingFrameSkip(undefined)).toBe(1);
  });
});

describe("Space shortcut", () => {
  it("starts Follow forward when tracking is ready", () => {
    expect(spaceShortcutAction({ canFollow: true })).toBe(
      "follow-forward",
    );
  });

  it("keeps tracking and subject selection actions contextual", () => {
    expect(spaceShortcutAction({ isTracking: true })).toBe(
      "stop-following",
    );
    expect(
      spaceShortcutAction({
        isSelecting: true,
        canSaveSelection: true,
        canFollow: true,
      }),
    ).toBe("save-selection");
    expect(spaceShortcutAction({ isSelecting: true })).toBe("none");
  });

  it("does nothing when no editing action is available", () => {
    expect(spaceShortcutAction()).toBe("none");
  });
});

describe("keyframe utilities", () => {
  const keyframes = [0, 6.78, 10.95, 20];
  const duration = 30;

  it("normalizes, filters, deduplicates, and sorts detected timestamps", () => {
    expect(
      normalizeKeyframes([10.95, -1, 6.78, 6.7800001, 50, Number.NaN], 30),
    ).toEqual([6.78, 10.95]);
  });

  it("extracts keyframe timestamps from a packet-level framecrc report", () => {
    const report = [
      "#tb 0: 1/1000",
      "0, 0, 0, 40, 1000, 0x12345678",
      "0, 40, 40, 40, 200, 0x12345678, F=0x0",
      "0, 80, 80, 40, 800, 0x12345678, F=0x1",
      "0, 120, 120, 40, 200, 0x12345678, F=0x0",
    ].join("\n");

    expect(parseFramecrcKeyframes(report, 1)).toEqual([0, 0.08]);
    expect(parseFramecrcKeyframes("invalid report", 1)).toEqual([]);
  });

  it("adds the video end as a valid selection boundary", () => {
    expect(keyframeBoundaries(keyframes, duration)).toEqual([
      0,
      6.78,
      10.95,
      20,
      30,
    ]);
    expect(keyframeBoundaries([0, 30], duration)).toEqual([0, 30]);
  });

  it("snaps to the nearest keyframe or the end boundary", () => {
    expect(nearestKeyframe(5, duration, keyframes)).toBe(6.78);
    expect(nearestKeyframe(9, duration, keyframes)).toBe(10.95);
    expect(nearestKeyframe(29.8, duration, keyframes)).toBe(30);
    expect(nearestKeyframe(12, duration, [])).toBe(30);
  });

  it("recognizes keyframe-aligned start and end boundaries", () => {
    expect(isKeyframeBoundary(6.79, "start", duration, keyframes)).toBe(true);
    expect(isKeyframeBoundary(9, "start", duration, keyframes)).toBe(false);
    expect(isKeyframeBoundary(0, "start", duration, keyframes)).toBe(true);
    expect(isKeyframeBoundary(30, "end", duration, keyframes)).toBe(true);
  });
});
