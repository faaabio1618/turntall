import { describe, expect, it } from "vitest";
import {
  formatStepDuration,
  ProcessingStepTracker,
} from "../src/processing-steps.js";

describe("processing step tracker", () => {
  it("moves through the steps and records actual durations", () => {
    const tracker = new ProcessingStepTracker(
      "Create vertical video",
    );

    tracker.start("prepare", 1000);
    expect(tracker.snapshot(2500)[0]).toMatchObject({
      label: "Load the source video",
      state: "active",
      elapsedSeconds: 1.5,
    });

    tracker.start("process", 3000);
    tracker.start("finalize", 8000);
    tracker.complete("finalize", 9000);

    expect(tracker.snapshot(9000)).toMatchObject([
      { state: "done", durationSeconds: 2 },
      {
        label: "Create vertical video",
        state: "done",
        durationSeconds: 5,
      },
      { state: "done", durationSeconds: 1 },
    ]);
  });

  it("records cancellation or failure on the active step", () => {
    const cancelled = new ProcessingStepTracker();
    cancelled.start("prepare", 0);
    cancelled.stop("cancelled", 2500);
    expect(cancelled.snapshot(2500)[0]).toMatchObject({
      state: "cancelled",
      durationSeconds: 2.5,
    });

    const failed = new ProcessingStepTracker();
    failed.start("process", 1000);
    failed.stop("failed", 2000);
    expect(failed.snapshot(2000)[1].state).toBe("failed");
  });

  it("ignores invalid transitions", () => {
    const tracker = new ProcessingStepTracker();
    tracker.start("missing", 0);
    tracker.start("prepare", Number.NaN);
    tracker.complete("prepare", 1);
    tracker.stop("done", 2);
    tracker.stop("failed", 2);

    expect(tracker.snapshot(2).every(({ state }) => state === "waiting"))
      .toBe(true);
  });
});

describe("processing step durations", () => {
  it("formats precise short durations and readable long durations", () => {
    expect(formatStepDuration(0.01)).toBe("<0.1 sec");
    expect(formatStepDuration(1.26)).toBe("1.3 sec");
    expect(formatStepDuration(15.6)).toBe("16 sec");
    expect(formatStepDuration(65)).toBe("1 min 05 sec");
    expect(formatStepDuration(-1)).toBe("");
  });
});
