import { describe, expect, it } from "vitest";
import { describeSelection } from "../../src/editor/selection-summary.ts";

const defaults = {
  start: 1,
  end: 4,
  duration: 10,
  vertical: false,
  snapToKeyframes: false,
  keyframes: [],
  keepAudio: true,
  videoSpeed: 1,
};

describe("describeSelection", () => {
  it("rejects invalid ranges", () => {
    expect(
      describeSelection({ ...defaults, start: 4, end: 1 }),
    ).toEqual({
      valid: false,
      text: "End time must be after start time and within the video.",
    });
  });

  it("describes exact timing without changing the existing wording", () => {
    expect(describeSelection(defaults)).toEqual({
      valid: true,
      text: "Selected: 00:01.00 → 00:04.00 (00:03.00) · Exact timing",
    });
  });

  it("describes vertical, muted, retimed output", () => {
    expect(
      describeSelection({
        ...defaults,
        vertical: true,
        keepAudio: false,
        videoSpeed: 2,
      }).text,
    ).toBe(
      "Selected: 00:01.00 → 00:04.00 (00:03.00) · 2× (00:01.50) · Vertical output · No audio",
    );
  });

  it("reports keyframe alignment for fast cuts", () => {
    expect(
      describeSelection({
        ...defaults,
        snapToKeyframes: true,
        keyframes: [0, 1, 4, 10],
      }).text,
    ).toContain(" · Fast cut ready");
  });

  it("guides unaligned fast-cut selections", () => {
    expect(
      describeSelection({
        ...defaults,
        start: 1.25,
        snapToKeyframes: true,
        keyframes: [0, 1, 4, 10],
      }).text,
    ).toContain(" · Move both edges to orange marks for a fast cut");
  });
});
