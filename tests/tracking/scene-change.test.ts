import { describe, expect, it } from "vitest";
import { sceneChangeScore } from "../../src/tracking/scene-change.ts";

function solidFrame(red, green, blue, width = 80, height = 45) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    data[offset] = red;
    data[offset + 1] = green;
    data[offset + 2] = blue;
    data[offset + 3] = 255;
  }
  return { width, height, data };
}

function frameWithMovingPatch(left) {
  const frame = solidFrame(30, 40, 50);
  for (let y = 12; y < 28; y += 1) {
    for (let x = left; x < left + 16; x += 1) {
      const offset = (y * frame.width + x) * 4;
      frame.data[offset] = 220;
      frame.data[offset + 1] = 80;
      frame.data[offset + 2] = 40;
    }
  }
  return frame;
}

describe("scene change detection", () => {
  it("detects a hard cut affecting the whole frame", () => {
    const result = sceneChangeScore(
      solidFrame(10, 10, 10),
      solidFrame(235, 235, 235),
    );

    expect(result.detected).toBe(true);
    expect(result.score).toBeGreaterThan(30);
    expect(result.changedRatio).toBe(1);
  });

  it("does not call local subject movement a scene change", () => {
    const result = sceneChangeScore(
      frameWithMovingPatch(20),
      frameWithMovingPatch(30),
    );

    expect(result.detected).toBe(false);
    expect(result.changedRatio).toBeLessThan(0.55);
  });

  it("does not detect identical frames or incompatible inputs", () => {
    const frame = solidFrame(50, 80, 110);

    expect(sceneChangeScore(frame, frame).detected).toBe(false);
    expect(
      sceneChangeScore(frame, solidFrame(50, 80, 110, 40, 30))
        .detected,
    ).toBe(false);
  });

  it("supports a more sensitive threshold when requested", () => {
    const result = sceneChangeScore(
      solidFrame(30, 30, 30),
      solidFrame(65, 65, 65),
      { threshold: 10 },
    );

    expect(result.detected).toBe(true);
  });
});
