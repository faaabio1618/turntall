import { describe, expect, it } from "vitest";
import {
  selectTrackingResult,
  trackOpticalFlow,
} from "../src/optical-flow-tracker.js";

function texturedFrame(left, top) {
  const width = 120;
  const height = 80;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const inside =
        x >= left && x < left + 30 && y >= top && y < top + 24;
      const value = inside
        ? 50 + ((x - left) * 37 + (y - top) * 53) % 190
        : 15;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("point optical-flow tracker", () => {
  it("tracks smooth translation between consecutive frames", () => {
    const box = { x: 0.25, y: 0.25, width: 0.25, height: 0.3 };
    const result = trackOpticalFlow(
      texturedFrame(30, 20),
      texturedFrame(36, 24),
      box,
    );

    expect(result.box.x).toBeCloseTo(36 / 120, 1);
    expect(result.box.y).toBeCloseTo(24 / 80, 1);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.points).toBeGreaterThanOrEqual(3);
  });

  it("reports no confidence without trackable texture", () => {
    const blank = texturedFrame(-100, -100);
    const box = { x: 0.25, y: 0.25, width: 0.25, height: 0.3 };

    expect(trackOpticalFlow(blank, blank, box).confidence).toBe(0);
  });
});

describe("tracking method selection", () => {
  const template = {
    box: { x: 0.2, y: 0.2, width: 0.3, height: 0.4 },
    confidence: 0.6,
  };
  const flow = {
    box: { x: 0.22, y: 0.2, width: 0.3, height: 0.4 },
    confidence: 0.8,
  };

  it("honors the explicit smooth and large movement modes", () => {
    expect(selectTrackingResult("smooth", template, flow).tracker).toBe(
      "smooth",
    );
    expect(selectTrackingResult("large", template, flow).tracker).toBe(
      "large",
    );
  });

  it("combines agreeing results in automatic mode", () => {
    const result = selectTrackingResult("automatic", template, flow);

    expect(result.tracker).toBe("automatic");
    expect(result.box.x).toBeGreaterThan(template.box.x);
    expect(result.box.x).toBeLessThan(flow.box.x);
    expect(result.confidence).toBeGreaterThan(flow.confidence);
  });

  it("chooses the stronger result when trackers disagree", () => {
    const distantFlow = {
      ...flow,
      box: { ...flow.box, x: 0.7 },
    };

    expect(
      selectTrackingResult("automatic", template, distantFlow).tracker,
    ).toBe("smooth");
  });
});
