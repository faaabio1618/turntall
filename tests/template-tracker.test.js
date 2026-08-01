import { describe, expect, it } from "vitest";
import {
  createTrackingTemplate,
  nearestTrackingConfidencePoint,
  trackTemplate,
  trackingConfidenceHue,
  trackingFrameInterval,
  trackingWaitMilliseconds,
  updateTrackingTemplate,
} from "../src/template-tracker.js";

function frameWithSubject(left, top, color = 235) {
  const width = 120;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inSubject =
        x >= left && x < left + 24 && y >= top && y < top + 20;
      const stripe = inSubject && (x + y) % 7 < 3;
      const value = inSubject ? (stripe ? color : 60) : 18;
      data[offset] = value;
      data[offset + 1] = inSubject ? value - 12 : 24;
      data[offset + 2] = inSubject ? value - 24 : 30;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

describe("template tracker", () => {
  it("finds a subject that moved between nearby frames", () => {
    const initial = frameWithSubject(30, 25);
    const moved = frameWithSubject(42, 31);
    const box = { x: 0.25, y: 0.3125, width: 0.2, height: 0.25 };
    const template = createTrackingTemplate(initial, box);

    const result = trackTemplate(moved, template, box);

    expect(result.box.x).toBeCloseTo(42 / 120, 1);
    expect(result.box.y).toBeCloseTo(31 / 80, 1);
    expect(result.confidence).toBeGreaterThan(0.65);
  });

  it("reports low confidence when the subject disappears", () => {
    const initial = frameWithSubject(30, 25);
    const blank = frameWithSubject(-100, -100);
    const box = { x: 0.25, y: 0.3125, width: 0.2, height: 0.25 };
    const template = createTrackingTemplate(initial, box);

    const result = trackTemplate(blank, template, box);

    expect(result.confidence).toBeLessThan(0.45);
  });

  it("can gently update appearance without changing template size", () => {
    const initial = frameWithSubject(30, 25);
    const changed = frameWithSubject(30, 25, 190);
    const box = { x: 0.25, y: 0.3125, width: 0.2, height: 0.25 };
    const template = createTrackingTemplate(initial, box);

    const updated = updateTrackingTemplate(template, changed, box, 0.2);

    expect(updated.values).toHaveLength(template.values.length);
    expect(updated.pixelWidth).toBe(template.pixelWidth);
    expect(updated.mean).not.toBe(template.mean);
  });
});

describe("tracking preview pace", () => {
  it("advances by one detected video frame", () => {
    expect(trackingFrameInterval(29.97)).toBeCloseTo(1 / 29.97);
  });

  it("supports faster tracking by skipping frames", () => {
    expect(trackingFrameInterval(30, 6)).toBeCloseTo(0.2);
  });

  it("falls back to 30 fps when frame rate is unavailable", () => {
    expect(trackingFrameInterval(undefined)).toBeCloseTo(1 / 30);
  });

  it("waits longer when the user selects a slower speed", () => {
    expect(trackingWaitMilliseconds(0.2, 1, 20)).toBe(180);
    expect(trackingWaitMilliseconds(0.2, 0.5, 20)).toBe(380);
    expect(trackingWaitMilliseconds(0.2, 0.25, 20)).toBe(780);
  });

  it("never returns a negative delay and falls back from invalid speeds", () => {
    expect(trackingWaitMilliseconds(0.2, 1, 250)).toBe(0);
    expect(trackingWaitMilliseconds(0.2, 0, 20)).toBe(180);
  });
});

describe("tracking confidence timeline", () => {
  it("maps confidence from red at the threshold to green at 100%", () => {
    expect(trackingConfidenceHue(0.2, 0.38)).toBe(0);
    expect(trackingConfidenceHue(0.38, 0.38)).toBe(0);
    expect(trackingConfidenceHue(0.69, 0.38)).toBeCloseTo(60);
    expect(trackingConfidenceHue(1, 0.38)).toBe(120);
  });

  it("finds the analyzed frame nearest a clicked time", () => {
    const points = [
      { time: 1, confidence: 0.9 },
      { time: 1.2, confidence: 0.5 },
      { time: 1.4, confidence: 0.2 },
    ];

    expect(nearestTrackingConfidencePoint(points, 1.31)).toEqual(
      points[2],
    );
    expect(nearestTrackingConfidencePoint([], 1)).toBeUndefined();
  });
});
