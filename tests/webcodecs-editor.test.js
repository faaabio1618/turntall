import { describe, expect, it, vi } from "vitest";
import {
  centeredCropRectangle,
  reportOutputFinalization,
  retimeVideoSample,
  shouldCopyTrimmedAudioPackets,
} from "../src/webcodecs-editor.js";

describe("native browser video editing", () => {
  it("centers the crop rectangle within the source frame", () => {
    expect(
      centeredCropRectangle(1280, 720, {
        width: 404,
        height: 720,
      }),
    ).toEqual({
      left: 438,
      top: 0,
      width: 404,
      height: 720,
    });
  });

  it("reports the actual start of output finalization once", async () => {
    const finalize = vi.fn(async () => {});
    const output = { finalize };
    const onFinalizing = vi.fn();

    reportOutputFinalization(output, onFinalizing);
    await output.finalize();
    await output.finalize();

    expect(finalize).toHaveBeenCalledTimes(2);
    expect(onFinalizing).toHaveBeenCalledOnce();
  });

  it("packet-copies undecodable audio for a trimmed segment", () => {
    expect(
      shouldCopyTrimmedAudioPackets({
        keepAudio: true,
        start: 373.99,
        firstTimestamp: 0,
        canDecode: false,
      }),
    ).toBe(true);
  });

  it("keeps the normal audio path when decoding is available", () => {
    expect(
      shouldCopyTrimmedAudioPackets({
        keepAudio: true,
        start: 373.99,
        firstTimestamp: 0,
        canDecode: true,
      }),
    ).toBe(false);
  });

  it("retimes video samples for the selected speed", () => {
    const sample = {
      timestamp: 3,
      duration: 0.04,
      setTimestamp(value) {
        this.timestamp = value;
      },
      setDuration(value) {
        this.duration = value;
      },
    };

    expect(retimeVideoSample(sample, 1.5)).toBe(sample);
    expect(sample.timestamp).toBe(2);
    expect(sample.duration).toBeCloseTo(0.04 / 1.5);
  });

});
