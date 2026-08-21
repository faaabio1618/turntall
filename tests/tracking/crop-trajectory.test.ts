import { describe, expect, it } from "vitest";
import {
  createCropTrajectory,
  createFFmpegCropFilter,
  cropPositionAtTime,
  cropRectangleAtTime,
  fitCropTrajectoryForFFmpeg,
  smoothAutomaticCropPositions,
  stabilizeTrackedReferences,
  subjectCropPosition,
} from "../../src/tracking/crop-trajectory.ts";

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

  it("uses a stabilized crop target without changing the subject box", () => {
    expect(
      subjectCropPosition(
        { ...rightReference, cropLeft: 640 },
        1280,
        720,
        dimensions.cropSize,
      ),
    ).toEqual({ left: 640, top: 0 });
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

    expect(smoothed).toHaveLength(3);
    expect(smoothed[0]).toEqual(points[0]);
    expect(smoothed[1].left).toBeLessThan(100);
    expect(smoothed[1].left).toBeGreaterThan(0);
    expect(smoothed[2]).toEqual(points[3]);
  });

  it("matches pyTracker's Gaussian horizontal filter", () => {
    const points = [
      { time: 0, left: 0, top: 0 },
      { time: 1, left: 100, top: 0, automatic: true },
      { time: 2, left: 80, top: 0, automatic: true },
      { time: 3, left: 120, top: 0 },
    ];

    const smoothed = smoothAutomaticCropPositions(points, 5, 0);

    expect(smoothed[1].left).toBeCloseTo(74.99059930133674, 10);
    expect(smoothed[2].left).toBeCloseTo(75.00965824160541, 10);
  });

  it("does not smooth across a new-position jump", () => {
    const points = [
      { time: 0, left: 0, top: 0 },
      { time: 1, left: 20, top: 0, automatic: true },
      { time: 2, left: 800, top: 0, jump: true },
    ];

    expect(smoothAutomaticCropPositions(points)).toEqual([
      points[0],
      points[2],
    ]);
  });

  it("uses the pyTracker deadband before moving the crop", () => {
    const points = [
      { time: 0, left: 0, top: 0 },
      { time: 1, left: 10, top: 0, automatic: true },
      { time: 2, left: 20, top: 0, automatic: true },
      { time: 3, left: 30, top: 0, automatic: true },
    ];

    expect(smoothAutomaticCropPositions(points, 0, 15)).toEqual([
      points[0],
      points[2],
      { ...points[3], left: 20 },
    ]);
  });

  it("limits automatic crop travel using elapsed video time", () => {
    const points = [
      { time: 0, left: 0, top: 0 },
      { time: 0.1, left: 400, top: 0, automatic: true },
      { time: 0.2, left: 800, top: 0, automatic: true },
    ];

    expect(smoothAutomaticCropPositions(points, 0, 0, 200)).toEqual([
      points[0],
      { ...points[1], left: 20 },
      { ...points[2], left: 40 },
    ]);
  });

  it("moves earlier automatic crops toward a future manual anchor", () => {
    const points = [
      { time: 0, left: 0, top: 0 },
      { time: 1, left: 0, top: 0, automatic: true },
      { time: 2, left: 400, top: 0, automatic: true },
      { time: 3, left: 600, top: 0 },
    ];

    expect(smoothAutomaticCropPositions(points, 0, 0, 200)).toEqual([
      points[0],
      { ...points[1], left: 200 },
      points[2],
      points[3],
    ]);
  });

  it("never changes manually drawn anchors to satisfy the speed limit", () => {
    const points = [
      { time: 0, left: 0, top: 0 },
      { time: 0.1, left: 800, top: 0 },
    ];

    expect(smoothAutomaticCropPositions(points, 0, 0, 200)).toEqual(
      points,
    );
  });

  it("does not smooth across samples outside the time window", () => {
    const points = [
      { time: 0, left: 0, top: 0 },
      { time: 0.1, left: 0, top: 0, automatic: true },
      { time: 2, left: 800, top: 0 },
    ];

    const smoothed = smoothAutomaticCropPositions(
      points,
      5,
      0,
      Number.POSITIVE_INFINITY,
      0.8,
    );
    expect(smoothed).toEqual([points[0], points[2]]);
  });

  it("stabilizes the crop without moving the tracked subject boxes", () => {
    const samples = [
      {
        time: 0,
        box: { x: 0.4, y: 0.2, width: 0.1, height: 0.4 },
        automatic: false,
      },
      {
        time: 1,
        box: { x: 0.405, y: 0.2, width: 0.1, height: 0.4 },
        automatic: true,
      },
      {
        time: 2,
        box: { x: 0.395, y: 0.2, width: 0.1, height: 0.4 },
        automatic: true,
      },
    ];

    const stabilized = stabilizeTrackedReferences(samples, {
      ...dimensions,
      sigma: 0,
      movementThreshold: 15,
    });

    expect(stabilized).toHaveLength(2);
    expect(stabilized[1]).toMatchObject({
      time: 2,
      box: samples[2].box,
      cropLeft: 374,
      stabilized: true,
    });
  });

  it("keeps a fast subject visible even when it exceeds the crop speed limit", () => {
    const samples = [
      {
        time: 0,
        box: { x: 0.05, y: 0.2, width: 0.1, height: 0.4 },
        automatic: false,
      },
      {
        time: 0.1,
        box: { x: 0.85, y: 0.2, width: 0.1, height: 0.4 },
        automatic: true,
      },
    ];

    const stabilized = stabilizeTrackedReferences(samples, {
      ...dimensions,
      sigma: 0,
      movementThreshold: 0,
      maximumSpeed: 200,
    });

    expect(stabilized[1]).toMatchObject({
      time: 0.1,
      box: samples[1].box,
      cropLeft: 812,
      stabilized: true,
    });
  });

  it("moves through the deadband when the subject reaches the crop edge", () => {
    const samples = [
      {
        time: 0,
        box: { x: 0.05, y: 0.2, width: 0.1, height: 0.4 },
        automatic: false,
      },
      {
        time: 0.1,
        box: {
          x: 0.2234375,
          y: 0.2,
          width: 0.1,
          height: 0.4,
        },
        automatic: true,
      },
    ];

    const stabilized = stabilizeTrackedReferences(samples, {
      ...dimensions,
      sigma: 0,
      movementThreshold: 15,
      maximumSpeed: 100,
    });

    expect(stabilized[1]).toMatchObject({
      time: 0.1,
      automatic: true,
    });
    expect(stabilized[1].cropLeft).toBeCloseTo(10, 8);
  });

  it("keeps automatic crops outside the stabilization window fixed", () => {
    const locked = {
      time: 0.2,
      box: { x: 0.1, y: 0.2, width: 0.1, height: 0.4 },
      cropLeft: 120,
      automatic: true,
    };
    const stabilized = stabilizeTrackedReferences(
      [
        { ...leftReference, time: 0 },
        locked,
        { ...rightReference, time: 2 },
      ],
      {
        ...dimensions,
        sigma: 0,
        movementThreshold: 0,
        maximumSpeed: 200,
        fixedBeforeTime: 1,
      },
    );

    expect(stabilized.find((point) => point.time === 0.2)).toMatchObject({
      cropLeft: 120,
      automatic: true,
    });
  });

  it("finds the minimum stronger stabilization for FFmpeg", () => {
    const samples = Array.from({ length: 42 }, (_, index) => ({
      time: index,
      box: {
        x: index % 2 === 0 ? 0.44 : 0.46,
        y: 0.2,
        width: 0.1,
        height: 0.4,
      },
      automatic: index > 0,
    }));

    const fitted = fitCropTrajectoryForFFmpeg(samples, {
      start: 0,
      end: 41,
      ...dimensions,
      maximumPoints: 20,
    });

    expect(fitted).toBeDefined();
    expect(fitted.originalPointCount).toBeGreaterThan(20);
    expect(fitted.trajectory.length).toBeLessThanOrEqual(20);
    expect(fitted.stabilizationTolerance).toBeGreaterThan(24.4);
    expect(fitted.stabilizationTolerance).toBeLessThan(24.6);
    expect(fitted.trajectory[0].time).toBe(0);
    expect(fitted.trajectory[0].left).toBeCloseTo(425.2, 8);
  });

  it("collapses a smooth frame-by-frame path without losing visibility", () => {
    const samples = Array.from({ length: 120 }, (_, index) => ({
      time: index / 24,
      box: {
        x: 0.1 + (0.6 * index) / 119,
        y: 0.2,
        width: 0.1,
        height: 0.4,
      },
      automatic: index > 0,
    }));

    const fitted = fitCropTrajectoryForFFmpeg(samples, {
      start: 0,
      end: 119 / 24,
      ...dimensions,
      maximumPoints: 10,
    });

    expect(fitted).toBeDefined();
    expect(fitted.originalPointCount).toBeGreaterThan(100);
    expect(fitted.trajectory.length).toBeLessThanOrEqual(10);
    expect(fitted.stabilizationTolerance).toBeLessThan(0.01);
  });

  it("does not simplify required manual crop positions", () => {
    const samples = Array.from({ length: 12 }, (_, index) => ({
      time: index,
      box: {
        x: index % 2 === 0 ? 0.1 : 0.8,
        y: 0.2,
        width: 0.1,
        height: 0.4,
      },
      automatic: false,
    }));

    expect(
      fitCropTrajectoryForFFmpeg(samples, {
        start: 0,
        end: 11,
        ...dimensions,
        maximumPoints: 8,
      }),
    ).toBeUndefined();
  });

  it("does not simplify automatic positions that keep the subject visible", () => {
    const samples = Array.from({ length: 12 }, (_, index) => ({
      time: index,
      box: {
        x: index % 2 === 0 ? 0.05 : 0.85,
        y: 0.2,
        width: 0.1,
        height: 0.4,
      },
      automatic: index > 0,
    }));

    expect(
      fitCropTrajectoryForFFmpeg(samples, {
        start: 0,
        end: 11,
        ...dimensions,
        maximumPoints: 8,
      }),
    ).toBeUndefined();
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
