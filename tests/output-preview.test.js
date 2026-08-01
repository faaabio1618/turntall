import { describe, expect, it } from "vitest";
import {
  fitPreviewCanvas,
  outputPreviewCanDraw,
  outputPreviewFrame,
  processingPreviewTime,
} from "../src/output-preview.js";

describe("preview canvas sizing", () => {
  it("keeps small videos at their source size", () => {
    expect(fitPreviewCanvas(404, 720)).toEqual({
      width: 404,
      height: 720,
    });
  });

  it("fits larger videos within the preview limit", () => {
    expect(fitPreviewCanvas(1920, 1080)).toEqual({
      width: 720,
      height: 405,
    });
  });

  it("rejects unusable dimensions", () => {
    expect(fitPreviewCanvas(0, 720)).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe("preview frame readiness", () => {
  it("waits for a decoded frame before drawing the canvas", () => {
    expect(
      outputPreviewCanDraw({
        readyState: 2,
        seeking: false,
        framePresented: false,
      }),
    ).toBe(false);
    expect(
      outputPreviewCanDraw({
        readyState: 2,
        seeking: true,
        framePresented: true,
      }),
    ).toBe(false);
  });

  it("draws after the requested frame has been presented", () => {
    expect(
      outputPreviewCanDraw({
        readyState: 2,
        seeking: false,
        framePresented: true,
      }),
    ).toBe(true);
  });
});

describe("output preview framing", () => {
  const base = {
    start: 2,
    end: 8,
    sourceWidth: 1280,
    sourceHeight: 720,
    references: [],
  };

  it("shows the full source frame for a normal cut", () => {
    expect(
      outputPreviewFrame({
        ...base,
        vertical: false,
        currentTime: 4,
      }),
    ).toEqual({
      left: 0,
      top: 0,
      width: 1280,
      height: 720,
    });
  });

  it("shows the subject-guided vertical crop at the preview time", () => {
    expect(
      outputPreviewFrame({
        ...base,
        vertical: true,
        currentTime: 5,
        references: [
          {
            time: 2,
            box: { x: 0, y: 0, width: 0.2, height: 0.5 },
          },
          {
            time: 8,
            box: { x: 0.8, y: 0, width: 0.2, height: 0.5 },
          },
        ],
      }),
    ).toEqual({
      left: 438,
      top: 0,
      width: 404,
      height: 720,
    });
  });
});

describe("processing preview position", () => {
  it("moves through the selected clip with processing progress", () => {
    expect(
      processingPreviewTime({ start: 10, end: 30, progress: 0.25 }),
    ).toBe(15);
    expect(
      processingPreviewTime({ start: 10, end: 30, progress: 2 }),
    ).toBe(30);
  });

  it("rejects an invalid selection or progress value", () => {
    expect(
      processingPreviewTime({ start: 10, end: 10, progress: 0.5 }),
    ).toBeUndefined();
    expect(
      processingPreviewTime({
        start: 0,
        end: 10,
        progress: Number.NaN,
      }),
    ).toBeUndefined();
  });
});
