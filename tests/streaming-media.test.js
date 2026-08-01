import { beforeEach, describe, expect, it, vi } from "vitest";

const media = vi.hoisted(() => ({
  inputInstances: [],
  inputState: undefined,
}));

vi.mock("mediabunny", () => {
  class BlobSource {
    constructor(file) {
      this.file = file;
    }
  }

  class Input {
    constructor(options) {
      this.options = options;
      this.state = media.inputState;
      this.dispose = vi.fn();
      media.inputInstances.push(this);
    }

    getPrimaryVideoTrack() {
      return Promise.resolve(this.state.videoTrack);
    }

    getPrimaryAudioTrack() {
      return Promise.resolve(this.state.audioTrack);
    }

    getDurationFromMetadata() {
      return Promise.resolve(this.state.duration);
    }
  }

  class EncodedPacketSink {
    constructor(track) {
      this.track = track;
    }

    getFirstKeyPacket() {
      return Promise.resolve(this.track.keyPackets?.[0]);
    }

    getNextKeyPacket(packet) {
      const index = this.track.keyPackets.indexOf(packet);
      return Promise.resolve(this.track.keyPackets[index + 1]);
    }

    getPacket(timestamp, options) {
      const packet = this.track.keyPackets.find(
        (candidate) => candidate.timestamp === timestamp,
      );
      if (!packet || !options?.verifyKeyPackets) {
        return Promise.resolve(packet);
      }
      return Promise.resolve({
        ...packet,
        type: packet.verifiedType ?? packet.type,
      });
    }
  }

  return {
    ALL_FORMATS: Symbol("formats"),
    BlobSource,
    EncodedPacketSink,
    Input,
  };
});

import {
  MAX_WASM_INPUT_BYTES,
  MEDIA_LOADING_STRATEGY,
  analyzeStreamingMedia,
  containerNamesForFilename,
  mediaLoadingStrategy,
  requiresStreamingInput,
} from "../src/streaming-media.js";

function videoTrack({
  codec = "avc",
  keyframes = [0, 1.25],
  verifiedTypes = [],
} = {}) {
  return {
    keyPackets: keyframes.map((timestamp, index) => ({
      timestamp,
      type: "key",
      verifiedType: verifiedTypes[index] ?? "key",
    })),
    getCodec: vi.fn(async () => codec),
    getDisplayWidth: vi.fn(async () => 1920),
    getDisplayHeight: vi.fn(async () => 1080),
    computePacketStats: vi.fn(async () => ({ averagePacketRate: 59.94 })),
  };
}

beforeEach(() => {
  media.inputInstances.length = 0;
  media.inputState = {
    duration: 8.5,
    videoTrack: videoTrack(),
    audioTrack: { getCodec: vi.fn(async () => "aac") },
  };
});

describe("large media routing", () => {
  it("keeps ordinary files on the wasm path", () => {
    expect(requiresStreamingInput(MAX_WASM_INPUT_BYTES)).toBe(false);
    expect(mediaLoadingStrategy(MAX_WASM_INPUT_BYTES)).toBe(
      MEDIA_LOADING_STRATEGY.MEMORY,
    );
    expect(requiresStreamingInput(Number.NaN)).toBe(false);
  });

  it("routes files above the safe wasm limit to streaming", () => {
    expect(requiresStreamingInput(MAX_WASM_INPUT_BYTES + 1)).toBe(true);
    expect(requiresStreamingInput(3_801_950_475)).toBe(true);
    expect(mediaLoadingStrategy(3_801_950_475)).toBe(
      MEDIA_LOADING_STRATEGY.STREAMING,
    );
  });

  it.each([
    ["BIGFILE.MP4", ["mov", "mp4"]],
    ["clip.m4v", ["mov", "mp4"]],
    ["clip.mov", ["mov"]],
    ["clip.webm", ["matroska", "webm"]],
    ["clip.mkv", ["matroska"]],
    ["clip.avi", ["avi"]],
    ["README", []],
  ])("maps %s to its container candidates", (filename, expected) => {
    expect(containerNamesForFilename(filename)).toEqual(expected);
  });
});

describe("streaming media analysis", () => {
  it("reads metadata and keyframes without loading the whole file", async () => {
    const onKeyframe = vi.fn();
    const result = await analyzeStreamingMedia(
      { name: "camera.mp4" },
      { onKeyframe },
    );

    expect(result).toEqual({
      readable: true,
      containerNames: ["mov", "mp4"],
      videoCodec: "h264",
      audioCodec: "aac",
      duration: 8.5,
      width: 1920,
      height: 1080,
      frameRate: 59.94,
      keyframes: [0, 1.25],
      keyframeIndexReliable: true,
      verifiedKeyframePrefixLength: 2,
    });
    expect(onKeyframe).toHaveBeenNthCalledWith(1, 0, 8.5);
    expect(onKeyframe).toHaveBeenNthCalledWith(2, 1.25, 8.5);
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });

  it("ignores invalid keyframe timestamps and supports video-only input", async () => {
    media.inputState.videoTrack = videoTrack({
      codec: "vp9",
      keyframes: [-1, Number.NaN, 2],
    });
    media.inputState.audioTrack = undefined;

    await expect(
      analyzeStreamingMedia({ name: "camera.webm" }),
    ).resolves.toMatchObject({
      readable: true,
      videoCodec: "vp9",
      audioCodec: undefined,
      keyframes: [2],
      keyframeIndexReliable: true,
      verifiedKeyframePrefixLength: 1,
    });
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });

  it("detects container keyframes that are not independently decodable", async () => {
    media.inputState.videoTrack = videoTrack({
      keyframes: [0, 0.667, 1.335, 2.002],
      verifiedTypes: ["key", "delta", "delta", "delta"],
    });

    await expect(
      analyzeStreamingMedia({ name: "broken-index.mp4" }),
    ).resolves.toMatchObject({
      keyframes: [0],
      keyframeIndexReliable: false,
      verifiedKeyframePrefixLength: 1,
    });
  });

  it("returns an unreadable result when no video track exists", async () => {
    media.inputState.videoTrack = undefined;

    await expect(
      analyzeStreamingMedia({ name: "audio.ogg" }),
    ).resolves.toEqual({
      readable: false,
      containerNames: ["ogg"],
      keyframes: [],
    });
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });

  it("aborts promptly and still disposes the input", async () => {
    await expect(
      analyzeStreamingMedia(
        { name: "large.mp4" },
        { isCancelled: () => true },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });
});
