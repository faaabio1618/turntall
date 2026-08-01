import { describe, expect, it } from "vitest";
import {
  createCropTrajectory,
  createFFmpegCropFilter,
  cropPositionAtTime,
  cropRectangleAtTime,
  smoothAutomaticCropPositions,
  subjectCropPosition,
} from "../src/crop-trajectory.js";

const dimensions = {
  sourceWidth: 1280,
  sourceHeight: 720,
  cropSize: { width: 404, height: 720 },
};

const leftReference = {
  time: 2,
  box: { x: 0.05, y: 0.2, width: 0.2, height: 0.5 },
};
const rightReference = {
  time: 8,
  box: { x: 0.75, y: 0.2, width: 0.2, height: 0.5 },
};

describe("subject crop positions", () => {
  it("centers the crop on the subject and clamps it to the frame", () => {
    expect(
      subjectCropPosition(leftReference, 1280, 720, dimensions.cropSize),
    ).toEqual({ left: 0, top: 0 });
    expect(
      subjectCropPosition(rightReference, 1280, 720, dimensions.cropSize),
    ).toEqual({ left: 876, top: 0 });
  });

  it("linearly interpolates between reference frames", () => {
    expect(
      cropPositionAtTime(
        [
          { time: 0, left: 0, top: 40 },
          { time: 10, left: 800, top: 140 },
        ],
        5,
      ),
    ).toEqual({ left: 400, top: 90 });
  });

  it("holds the old crop until a new-position reference", () => {
    const points = [
      { time: 0, left: 50, top: 0, jump: false },
      { time: 5, left: 700, top: 0, jump: true },
    ];

    expect(cropPositionAtTime(points, 4.99)).toEqual({
      left: 50,
      top: 0,
    });
    expect(cropPositionAtTime(points, 5)).toEqual({
      left: 700,
      top: 0,
    });
  });
});

describe("crop trajectories", () => {
  it("smooths tracked jitter while preserving manual positions", () => {
    const points = [
      { time: 0, left: 0, top: 0 },
      { time: 1, left: 100, top: 20, automatic: true },
      { time: 2, left: 80, top: 0, automatic: true },
      { time: 3, left: 120, top: 0 },
    ];
    const smoothed = smoothAutomaticCropPositions(points);

    expect(smoothed[0]).toEqual(points[0]);
    expect(smoothed[1].left).toBeLessThan(100);
    expect(smoothed[2].left).toBeGreaterThan(80);
    expect(smoothed[3]).toEqual(points[3]);
  });

  it("does not smooth across a new-position jump", () => {
    const points = [
      { time: 0, left: 0, top: 0 },
      { time: 1, left: 20, top: 0, automatic: true },
      { time: 2, left: 800, top: 0, jump: true },
    ];

    expect(smoothAutomaticCropPositions(points)).toEqual(points);
  });

  it("creates clip-relative endpoints and interior reference frames", () => {
    const trajectory = createCropTrajectory(
      [leftReference, rightReference],
      {
        start: 0,
        end: 10,
        ...dimensions,
      },
    );

    expect(trajectory).toEqual([
      { time: 0, jump: false, left: 0, top: 0 },
      { time: 2, jump: false, left: 0, top: 0 },
      { time: 8, jump: false, left: 876, top: 0 },
      { time: 10, jump: false, left: 876, top: 0 },
    ]);
  });

  it("interpolates the crop at trimmed clip boundaries", () => {
    const trajectory = createCropTrajectory(
      [leftReference, rightReference],
      {
        start: 5,
        end: 7,
        ...dimensions,
      },
    );

    expect(trajectory[0]).toEqual({
      time: 0,
      jump: false,
      left: 438,
      top: 0,
    });
    expect(trajectory[1]).toEqual({
      time: 2,
      jump: false,
      left: 730,
      top: 0,
    });
  });

  it("falls back to the centered crop without references", () => {
    expect(
      createCropTrajectory([], {
        start: 0,
        end: 10,
        ...dimensions,
      }),
    ).toEqual([{ time: 0, left: 438, top: 0 }]);
  });

  it("returns an integer crop rectangle for each encoded frame", () => {
    expect(
      cropRectangleAtTime(
        [
          { time: 0, left: 0, top: 0 },
          { time: 3, left: 100, top: 50 },
        ],
        1,
        dimensions.cropSize,
      ),
    ).toEqual({
      left: 33,
      top: 17,
      width: 404,
      height: 720,
    });
  });

  it("builds a frame-evaluated crop expression for local processing", () => {
    const filter = createFFmpegCropFilter(dimensions.cropSize, [
      { time: 0, left: 0, top: 0 },
      { time: 4, left: 400, top: 0 },
      { time: 8, left: 800, top: 0 },
    ]);

    expect(filter).toContain("crop=404:720:");
    expect(filter).toContain("if(lt(t\\,4)");
    expect(filter).toContain("400*(t-0)/4");
    expect(filter).toContain("if(lt(t\\,8)");
  });

  it("builds a step expression for a new-position reference", () => {
    const filter = createFFmpegCropFilter(dimensions.cropSize, [
      { time: 0, left: 100, top: 0, jump: false },
      { time: 5, left: 800, top: 0, jump: true },
    ]);

    expect(filter).toContain("if(lt(t\\,5)\\,100\\,800)");
    expect(filter).not.toContain("*(t-0)");
  });
});
