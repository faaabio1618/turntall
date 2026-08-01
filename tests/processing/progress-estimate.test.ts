import { describe, expect, it } from "vitest";
import {
  estimateRemainingSeconds,
  formatEstimatedTime,
  progressFromProcessingLog,
  ProgressTimeEstimator,
} from "../../src/processing/progress-estimate.ts";

describe("processing time estimates", () => {
  it("estimates remaining time from elapsed progress", () => {
    expect(estimateRemainingSeconds(0.25, 10)).toBe(30);
    expect(estimateRemainingSeconds(0.5, 12)).toBe(12);
    expect(estimateRemainingSeconds(1, 12)).toBe(0);
  });

  it("rejects progress values that cannot produce an estimate", () => {
    expect(estimateRemainingSeconds(0, 10)).toBeUndefined();
    expect(estimateRemainingSeconds(Number.NaN, 10)).toBeUndefined();
    expect(estimateRemainingSeconds(0.5, -1)).toBeUndefined();
  });

  it("formats seconds, minutes, and hours for the user", () => {
    expect(formatEstimatedTime(12.1)).toBe("13 sec");
    expect(formatEstimatedTime(65)).toBe("1 min 05 sec");
    expect(formatEstimatedTime(3723)).toBe("1 hr 02 min");
    expect(formatEstimatedTime(Number.NaN)).toBe("");
  });

  it("keeps progress monotonic when the converter repeats or goes backwards", () => {
    const estimator = new ProgressTimeEstimator({
      minElapsedSeconds: 0,
      minProgress: 0,
      minSampleIntervalSeconds: 0,
    });

    expect(estimator.update(0.25, 2).progress).toBe(0.25);
    const firstEstimate = estimator.update(
      0.5,
      4,
    ).remainingSeconds;
    expect(estimator.update(0.5, 8)).toEqual({
      progress: 0.5,
      remainingSeconds: firstEstimate,
    });
    expect(estimator.update(0.4, 10)).toEqual({
      progress: 0.5,
      remainingSeconds: firstEstimate,
    });
  });

  it("waits for stable progress before showing an estimate", () => {
    const estimator = new ProgressTimeEstimator();

    expect(estimator.update(0.003, 1).remainingSeconds).toBeUndefined();
    expect(estimator.update(0.004, 2).remainingSeconds).toBeUndefined();
    expect(estimator.update(0.06, 3).remainingSeconds).toBeCloseTo(
      47,
    );
  });

  it("uses recent progress speed and smooths changing estimates", () => {
    const estimator = new ProgressTimeEstimator({
      minElapsedSeconds: 0,
      minProgress: 0,
      minSampleIntervalSeconds: 0,
      windowSeconds: 3,
    });

    estimator.update(0.1, 1);
    const early = estimator.update(0.2, 2).remainingSeconds;
    const later = estimator.update(0.5, 4).remainingSeconds;

    expect(early).toBeCloseTo(8);
    expect(later).toBeLessThan(early);
  });

  it("handles completion, reset, and invalid samples", () => {
    const estimator = new ProgressTimeEstimator({
      minElapsedSeconds: 0,
      minProgress: 0,
      minSampleIntervalSeconds: 0,
    });

    expect(estimator.update(Number.NaN, 1)).toEqual({
      progress: 0,
      remainingSeconds: undefined,
    });
    expect(estimator.update(2, 2)).toEqual({
      progress: 1,
      remainingSeconds: 0,
    });
    estimator.reset();
    expect(estimator.update(0.25, -1)).toEqual({
      progress: 0,
      remainingSeconds: undefined,
    });
  });
});

describe("processing log progress", () => {
  it("calculates progress from a processed video timestamp", () => {
    expect(
      progressFromProcessingLog(
        "frame=500 time=00:00:12.50 speed=1.2x",
        50,
      ),
    ).toBe(0.25);
    expect(
      progressFromProcessingLog("time=01:02:03.00", 3600),
    ).toBe(1);
  });

  it("ignores logs and durations without a usable timestamp", () => {
    expect(
      progressFromProcessingLog("time=N/A", 30),
    ).toBeUndefined();
    expect(
      progressFromProcessingLog("time=00:00:01.00", 0),
    ).toBeUndefined();
    expect(progressFromProcessingLog(undefined, 30)).toBeUndefined();
  });
});
