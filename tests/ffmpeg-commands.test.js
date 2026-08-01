import { describe, expect, it } from "vitest";
import {
  createCutArgs,
  createDecodeProbeArgs,
  createKeyframeScanArgs,
} from "../src/ffmpeg-commands.js";

const baseCut = {
  inputName: "input-1.mp4",
  outputName: "cut-1.mp4",
  start: 6.78,
  end: 10.95,
  cropSize: { width: 810, height: 1440 },
};

describe("FFmpeg keyframe scanning", () => {
  it("copies compressed packets into a framecrc report without decoding", () => {
    expect(createKeyframeScanArgs("input.mp4", "report.txt")).toEqual([
      "-hide_banner",
      "-i",
      "input.mp4",
      "-map",
      "0:v:0",
      "-c:v",
      "copy",
      "-f",
      "framecrc",
      "-y",
      "report.txt",
    ]);
  });
});

describe("FFmpeg decode probing", () => {
  it("decodes one video frame without creating an output file", () => {
    expect(createDecodeProbeArgs("input.mp4")).toEqual([
      "-hide_banner",
      "-v",
      "error",
      "-threads",
      "1",
      "-i",
      "input.mp4",
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ]);
  });
});

describe("FFmpeg cut commands", () => {
  it("uses stream copy for a normal fast cut", () => {
    const args = createCutArgs({
      ...baseCut,
      vertical: false,
      accurate: false,
    });

    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("-threads");
    expect(args).toContain("0:a?");
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(args.at(-1)).toBe("cut-1.mp4");
  });

  it("re-encodes a frame-accurate cut", () => {
    const args = createCutArgs({
      ...baseCut,
      vertical: false,
      accurate: true,
    });

    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).toContain("-threads");
    expect(args.indexOf("-ss")).toBeGreaterThan(args.indexOf("-i"));
    expect(args).not.toContain("copy");
    expect(args).not.toContain("+faststart");
  });

  it("adds the centered crop and encoder-safe pixel format in vertical mode", () => {
    const args = createCutArgs({
      ...baseCut,
      vertical: true,
      accurate: false,
    });

    expect(args).toContain(
      "crop=810:1440:(iw-810)/2:(ih-1440)/2",
    );
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("-threads");
    expect(args.indexOf("-ss")).toBeGreaterThan(args.indexOf("-i"));
    expect(args).not.toContain("copy");
    expect(args).not.toContain("+faststart");
  });

  it("uses a time-varying crop for subject reference frames", () => {
    const args = createCutArgs({
      ...baseCut,
      vertical: true,
      accurate: true,
      cropTrajectory: [
        { time: 0, left: 50, top: 0, jump: false },
        { time: 2, left: 500, top: 0, jump: false },
      ],
    });
    const filter = args[args.indexOf("-vf") + 1];

    expect(filter).toContain("setpts=PTS-STARTPTS");
    expect(filter).toContain("crop=810:1440:");
    expect(filter).toContain("if(lt(t\\,2)");
    expect(filter).not.toContain("(iw-810)/2");
  });

  it("removes the audio track when silent output is selected", () => {
    for (const mode of [
      { vertical: false, accurate: false },
      { vertical: false, accurate: true },
      { vertical: true, accurate: true },
    ]) {
      const args = createCutArgs({
        ...baseCut,
        ...mode,
        keepAudio: false,
      });

      expect(args).toContain("-an");
      expect(args).not.toContain("0:a?");
      expect(args).not.toContain("aac");
    }
  });

  it("changes video timing and mutes output when speed is selected", () => {
    const args = createCutArgs({
      ...baseCut,
      vertical: false,
      accurate: false,
      playbackRate: 1.5,
      keepAudio: false,
    });

    expect(args[args.indexOf("-vf") + 1]).toBe(
      "setpts=(PTS-STARTPTS)/1.5",
    );
    expect(args).toContain("-an");
    expect(args).not.toContain("-af");
    expect(args).toContain("libx264");
    expect(args).not.toContain("copy");
  });
});
