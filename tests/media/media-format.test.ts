import { describe, expect, it } from "vitest";
import {
  decoderSupport,
  ffmpegReencodeCommand,
  mediaCompatibilityWarning,
  parseDecoderList,
  parseMediaProbeLogs,
  processingFailureMessage,
  selectStreamCopyContainer,
  sourceExtension,
} from "../../src/media/media-format.ts";

describe("FFmpeg recovery command", () => {
  it("uses the selected filename and writes a separate MP4", () => {
    expect(ffmpegReencodeCommand("my long clip.mov")).toBe(
      'ffmpeg -i "my long clip.mov" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -force_key_frames "expr:gte(t,n_forced*2)" -c:a aac -b:a 192k -movflags +faststart "my long clip-reencoded.mp4"',
    );
  });

  it("provides safe placeholder names when the filename is blank", () => {
    expect(ffmpegReencodeCommand(" ")).toContain(
      '-i "input.mp4"',
    );
    expect(ffmpegReencodeCommand("video")).toContain(
      '"video-reencoded.mp4"',
    );
  });
});

describe("media probing", () => {
  const av1Mp4Logs = [
    "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'input-1.media':",
    "  Duration: 00:00:46.21, start: 0.000000, bitrate: 963 kb/s",
    "  Stream #0:0: Video: av1 (Main), yuv420p, 1280x720, 29.97 fps",
  ];

  it("reads the real container and stream metadata from FFmpeg logs", () => {
    expect(parseMediaProbeLogs(av1Mp4Logs)).toEqual({
      containerNames: ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"],
      videoCodec: "av1",
      audioCodec: undefined,
      duration: 46.21,
      width: 1280,
      height: 720,
      frameRate: 29.97,
    });
  });

  it("returns empty metadata when FFmpeg cannot identify the input", () => {
    expect(parseMediaProbeLogs(["Invalid data found when processing input"])).toEqual({
      containerNames: [],
      videoCodec: undefined,
      audioCodec: undefined,
      duration: undefined,
      width: undefined,
      height: undefined,
      frameRate: undefined,
    });
  });

  it("detects an audio stream when one is present", () => {
    const media = parseMediaProbeLogs([
      "Input #0, matroska,webm, from 'input.media':",
      "Duration: 01:02:03.50, start: 0.000000",
      "Stream #0:0: Video: vp9, yuv420p, 1920x1080, 30 fps",
      "Stream #0:1: Audio: opus, 48000 Hz, stereo",
    ]);

    expect(media.audioCodec).toBe("opus");
    expect(media.duration).toBe(3723.5);
    expect(media.frameRate).toBe(30);
  });

  it("does not trust a misleading filename extension", () => {
    const media = parseMediaProbeLogs(av1Mp4Logs);
    const output = selectStreamCopyContainer(media, "test.webm");

    expect(output.extension).toBe("mp4");
  });

  it("parses the bundled FFmpeg decoder list", () => {
    const decoders = parseDecoderList([
      " VFS..D h264                 H.264 / AVC",
      " A....D opus                 Opus",
      " ------",
    ]);

    expect(decoders).toEqual(new Set(["h264", "opus"]));
  });
});

describe("stream-copy container selection", () => {
  it("preserves QuickTime MOV and professional MOV codecs", () => {
    expect(
      selectStreamCopyContainer(
        { containerNames: ["mov", "mp4"], videoCodec: "h264" },
        "clip.mov",
      ).extension,
    ).toBe("mov");
    expect(
      selectStreamCopyContainer(
        { containerNames: ["mov", "mp4"], videoCodec: "prores" },
        "clip.bin",
      ).extension,
    ).toBe("mov");
  });

  it("keeps compatible VP9 and Opus streams in WebM", () => {
    const output = selectStreamCopyContainer(
      {
        containerNames: ["matroska", "webm"],
        videoCodec: "vp9",
        audioCodec: "opus",
      },
      "clip.webm",
    );

    expect(output.extension).toBe("webm");
    expect(output.mimeType).toBe("video/webm");
  });

  it("uses MKV when Matroska streams are not WebM-compatible", () => {
    const output = selectStreamCopyContainer(
      {
        containerNames: ["matroska", "webm"],
        videoCodec: "h264",
        audioCodec: "aac",
      },
      "clip.webm",
    );

    expect(output.extension).toBe("mkv");
  });

  it("uses MKV when only the audio codec is incompatible with WebM", () => {
    expect(
      selectStreamCopyContainer(
        {
          containerNames: ["matroska", "webm"],
          videoCodec: "vp9",
          audioCodec: "aac",
        },
        "clip.webm",
      ).extension,
    ).toBe("mkv");
  });

  it.each([
    [["avi"], "avi"],
    [["mpegts"], "ts"],
    [["mpeg"], "mpg"],
    [["ogg"], "ogv"],
    [["flv"], "flv"],
    [["asf"], "asf"],
  ])("selects an output for %s", (containerNames, extension) => {
    expect(
      selectStreamCopyContainer(
        { containerNames, videoCodec: "mpeg4" },
        "misnamed.bin",
      ).extension,
    ).toBe(extension);
  });

  it("falls back to MKV for an uncommon readable container", () => {
    const output = selectStreamCopyContainer(
      { containerNames: ["something"], videoCodec: "h264" },
      "clip.bin",
    );

    expect(output.extension).toBe("mkv");
    expect(output.fallback).toBe(true);
  });
});

describe("codec support", () => {
  it("allows re-encoding when all stream decoders are present", () => {
    expect(
      decoderSupport(
        { videoCodec: "vp9", audioCodec: "opus" },
        new Set(["vp9", "opus"]),
      ),
    ).toEqual({ canReencode: true, missingDecoders: [] });
  });

  it("reports missing decoders while preserving stream-copy support", () => {
    expect(
      decoderSupport(
        { videoCodec: "av1", audioCodec: undefined },
        new Set(["h264", "vp9"]),
      ),
    ).toEqual({ canReencode: false, missingDecoders: ["av1"] });
  });

  it("keeps re-encoding available when capability probing is unavailable", () => {
    expect(
      decoderSupport(
        { videoCodec: "h264", audioCodec: "aac" },
        new Set(),
      ).canReencode,
    ).toBe(true);
  });

  it("requires a video stream before enabling re-encoding", () => {
    expect(
      decoderSupport(
        { videoCodec: undefined, audioCodec: "aac" },
        new Set(["aac"]),
      ).canReencode,
    ).toBe(false);
  });
});

describe("filename extensions", () => {
  it("normalizes known and missing extensions", () => {
    expect(sourceExtension("MOVIE.WEBM")).toBe("webm");
    expect(sourceExtension("movie")).toBe("");
  });
});

describe("user-facing compatibility warnings", () => {
  it("shows nothing when the normal workflow is available", () => {
    expect(
      mediaCompatibilityWarning({
        readable: true,
        canReencode: true,
        browserPreviewReadable: true,
      }),
    ).toBe("");
  });

  it("does not warn just because the filename is misleading", () => {
    expect(
      mediaCompatibilityWarning({
        readable: true,
        canReencode: true,
        browserPreviewReadable: true,
      }),
    ).toBe("");
  });

  it("warns when previewing or advanced editing is unavailable", () => {
    const warning = mediaCompatibilityWarning({
      readable: true,
      canReencode: false,
      browserPreviewReadable: false,
    });

    expect(warning).toContain("preview is not available");
    expect(warning).toContain("Exact cuts and vertical video are not available");
    expect(warning).not.toContain("FFmpeg");
    expect(warning).not.toContain("codec");
  });

  it("shows a direct recovery message for unreadable input", () => {
    expect(
      mediaCompatibilityWarning({
        readable: false,
        canReencode: false,
        browserPreviewReadable: false,
      }),
    ).toBe(
      "This video cannot be processed in your browser. Try another video or export it again from your video editor.",
    );
  });

  it("explains when the file's seek index is invalid", () => {
    expect(
      mediaCompatibilityWarning({
        readable: true,
        canReencode: true,
        browserPreviewReadable: true,
        invalidSeekIndex: true,
      }),
    ).toBe(
      "This video has invalid seek data, so browsers cannot move to the correct frame. Re-export or re-encode it, then load the new file.",
    );
  });
});

describe("user-facing processing failures", () => {
  const firefoxEncoderError = new Error(
    "This specific encoder configuration (avc1.640016, 929000 bps, 404x720, hardware acceleration: prefer-hardware) is not supported by this browser.",
  );

  it("recommends Chrome when vertical browser encoding is unsupported", () => {
    expect(
      processingFailureMessage(firefoxEncoderError, {
        browserEncoding: true,
        vertical: true,
      }),
    ).toBe(
      "This browser cannot create a vertical video from this file. Open this page in Chrome and try again.",
    );
  });

  it("uses an exact-cut message for the same browser limitation", () => {
    expect(
      processingFailureMessage(
        "VideoEncoder configuration is unsupported",
        {
          browserEncoding: true,
          vertical: false,
        },
      ),
    ).toContain("cannot make an exact cut");
  });

  it("does not blame the browser for unrelated processing errors", () => {
    expect(
      processingFailureMessage(new Error("Input data is corrupt"), {
        browserEncoding: true,
        vertical: true,
      }),
    ).toBe(
      "This video could not be cut with the selected options. Try fast cut mode or another video.",
    );
  });

  it("keeps non-browser encoding failures generic", () => {
    expect(
      processingFailureMessage(firefoxEncoderError, {
        browserEncoding: false,
        vertical: true,
      }),
    ).not.toContain("Chrome");
  });
});
