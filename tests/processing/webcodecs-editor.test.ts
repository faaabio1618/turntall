import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const media = vi.hoisted(() => ({
  audioSources: [],
  bufferResult: new Uint8Array([1, 2, 3]),
  conversion: undefined,
  conversionInit: vi.fn(),
  inputInstances: [],
  inputState: undefined,
  outputInstances: [],
  packetSinkState: undefined,
  streamTargets: [],
}));

vi.mock("mediabunny", () => {
  class BlobSource {
    constructor(file) {
      this.file = file;
    }
  }

  class BufferTarget {
    constructor() {
      this.buffer = media.bufferResult;
    }
  }

  class StreamTarget {
    constructor(writable, options) {
      this.writable = writable;
      this.options = options;
      media.streamTargets.push(this);
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
  }

  class Output {
    constructor(options) {
      this.options = options;
      this.addAudioTrack = vi.fn();
      this.cancel = vi.fn(async () => {});
      this.finalize = vi.fn(async () => {});
      media.outputInstances.push(this);
    }
  }

  class Mp4OutputFormat {
    constructor(options) {
      this.options = options;
    }
  }

  class EncodedAudioPacketSource {
    constructor(codec) {
      this.codec = codec;
      this.add = vi.fn(async () => {});
      this.close = vi.fn();
      media.audioSources.push(this);
    }
  }

  class EncodedPacketSink {
    constructor(track) {
      this.track = track;
    }

    getPacket() {
      return Promise.resolve(media.packetSinkState?.packets[0]);
    }

    getNextPacket(packet) {
      const packets = media.packetSinkState?.packets ?? [];
      return Promise.resolve(packets[packets.indexOf(packet) + 1]);
    }
  }

  return {
    ALL_FORMATS: Symbol("formats"),
    BlobSource,
    BufferTarget,
    Conversion: { init: media.conversionInit },
    EncodedAudioPacketSource,
    EncodedPacketSink,
    Input,
    Mp4OutputFormat,
    Output,
    QUALITY_HIGH: 9_000_000,
    StreamTarget,
  };
});

import {
  canEditWithWebCodecs,
  centeredCropRectangle,
  cutWithWebCodecs,
  reportOutputFinalization,
  retimeVideoSample,
  shouldCopyTrimmedAudioPackets,
} from "../../src/processing/webcodecs-editor.ts";

function createConversion({
  isValid = true,
  utilizedTracks,
  discardedTracks = [],
  execute,
} = {}) {
  const conversion = {
    isValid,
    utilizedTracks:
      utilizedTracks ?? [media.inputState.videoTrack, media.inputState.audioTrack]
        .filter(Boolean),
    discardedTracks,
    _trackPromises: [],
    _started: Promise.resolve(),
    _canceled: false,
    output: undefined,
    execute: vi.fn(async function () {
      this.onProgress?.(0.5);
      await Promise.all(this._trackPromises);
      await this.output.finalize();
      return execute?.();
    }),
    cancel: vi.fn(async function () {
      this._canceled = true;
    }),
  };
  return conversion;
}

function packet(timestamp, nextTimestamp = timestamp + 0.02) {
  return {
    timestamp,
    clone: vi.fn(({ timestamp: adjustedTimestamp }) => ({
      timestamp: adjustedTimestamp,
      duration: nextTimestamp - timestamp,
    })),
  };
}

beforeEach(() => {
  const videoTrack = { id: "video" };
  const audioTrack = {
    id: "audio",
    canDecode: vi.fn(async () => true),
    getCodec: vi.fn(async () => "aac"),
    getDecoderConfig: vi.fn(async () => ({ codec: "mp4a.40.2" })),
    getFirstTimestamp: vi.fn(async () => 0),
  };
  media.audioSources.length = 0;
  media.bufferResult = new Uint8Array([1, 2, 3]);
  media.inputInstances.length = 0;
  media.inputState = { videoTrack, audioTrack };
  media.outputInstances.length = 0;
  media.packetSinkState = { packets: [] };
  media.streamTargets.length = 0;
  media.conversion = createConversion();
  media.conversionInit.mockReset();
  media.conversionInit.mockImplementation(async ({ output }) => {
    media.conversion.output = output;
    return media.conversion;
  });
  vi.stubGlobal("VideoDecoder", class VideoDecoder {});
  vi.stubGlobal("VideoEncoder", class VideoEncoder {});
  vi.stubGlobal("navigator", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native browser video editing helpers", () => {
  it("centers the crop rectangle within the source frame", () => {
    expect(
      centeredCropRectangle(1280, 720, {
        width: 404,
        height: 720,
      }),
    ).toEqual({ left: 438, top: 0, width: 404, height: 720 });
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

  it.each([
    [{ keepAudio: true, start: 4, firstTimestamp: 0, canDecode: false }, true],
    [{ keepAudio: true, start: 4, firstTimestamp: 0, canDecode: true }, false],
    [{ keepAudio: false, start: 4, firstTimestamp: 0, canDecode: false }, false],
    [{ keepAudio: true, start: 0, firstTimestamp: 0, canDecode: false }, false],
    [{ keepAudio: true, start: Number.NaN, firstTimestamp: 0, canDecode: false }, false],
  ])("selects packet-copy audio when appropriate", (options, expected) => {
    expect(shouldCopyTrimmedAudioPackets(options)).toBe(expected);
  });

  it("retimes video samples only when speed changes", () => {
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

    expect(retimeVideoSample(sample, 1)).toBe(sample);
    expect(sample.timestamp).toBe(3);
    expect(retimeVideoSample(sample, 1.5)).toBe(sample);
    expect(sample.timestamp).toBe(2);
    expect(sample.duration).toBeCloseTo(0.04 / 1.5);
  });
});

describe("WebCodecs capability probing", () => {
  it("returns false without the native codec APIs", async () => {
    vi.stubGlobal("VideoDecoder", undefined);

    await expect(
      canEditWithWebCodecs(new Blob(), {
        sourceWidth: 1920,
        sourceHeight: 1080,
        cropSize: { width: 608, height: 1080 },
      }),
    ).resolves.toBe(false);
    expect(media.conversionInit).not.toHaveBeenCalled();
  });

  it("validates a centered vertical conversion and disposes the input", async () => {
    await expect(
      canEditWithWebCodecs(new Blob(), {
        sourceWidth: 1920,
        sourceHeight: 1080,
        cropSize: { width: 608, height: 1080 },
      }),
    ).resolves.toBe(true);

    const options = media.conversionInit.mock.calls[0][0];
    expect(options.video).toMatchObject({
      codec: "avc",
      crop: { left: 656, top: 0, width: 608, height: 1080 },
      forceTranscode: true,
      hardwareAcceleration: "prefer-hardware",
    });
    expect(options.trim).toBeUndefined();
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });

  it("rejects a source without video and disposes it", async () => {
    media.inputState.videoTrack = undefined;

    await expect(
      canEditWithWebCodecs(new Blob(), {
        sourceWidth: 100,
        sourceHeight: 100,
        cropSize: { width: 56, height: 100 },
      }),
    ).resolves.toBe(false);
    expect(media.conversionInit).not.toHaveBeenCalled();
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });

  it("returns false and cancels output when initialization throws", async () => {
    media.conversionInit.mockRejectedValueOnce(new Error("unsupported codec"));

    await expect(
      canEditWithWebCodecs(new Blob(), {
        sourceWidth: 100,
        sourceHeight: 100,
        cropSize: { width: 56, height: 100 },
      }),
    ).resolves.toBe(false);
    expect(media.outputInstances[0].cancel).toHaveBeenCalledOnce();
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });
});

describe("WebCodecs cutting", () => {
  const baseOptions = () => ({
    start: 1,
    end: 3,
    vertical: false,
    sourceWidth: 1920,
    sourceHeight: 1080,
    cropSize: { width: 608, height: 1080 },
    cropTrajectory: undefined,
    keepAudio: true,
    playbackRate: 1,
  });

  it("runs the buffer-backed conversion through every phase", async () => {
    const onProgress = vi.fn();
    const onConversion = vi.fn();
    const onPhase = vi.fn();

    await expect(
      cutWithWebCodecs(new Blob(), {
        ...baseOptions(),
        onProgress,
        onConversion,
        onPhase,
      }),
    ).resolves.toEqual({
      data: media.bufferResult,
      cleanup: undefined,
    });

    expect(onPhase.mock.calls.map(([phase]) => phase)).toEqual([
      "preparing",
      "processing",
      "finalizing",
    ]);
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(onConversion).toHaveBeenNthCalledWith(1, media.conversion);
    expect(onConversion).toHaveBeenLastCalledWith(undefined);
    expect(media.conversionInit.mock.calls[0][0]).toMatchObject({
      trim: { start: 1, end: 3 },
      audio: undefined,
    });
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });

  it("retimes a speed-only conversion and removes audio", async () => {
    await cutWithWebCodecs(new Blob(), {
      ...baseOptions(),
      playbackRate: 2,
    });

    const options = media.conversionInit.mock.calls[0][0];
    expect(options.audio).toEqual(expect.any(Function));
    const sample = {
      timestamp: 4,
      duration: 0.04,
      setTimestamp: vi.fn(),
      setDuration: vi.fn(),
    };
    expect(options.video.process(sample)).toBe(sample);
    expect(sample.setTimestamp).toHaveBeenCalledWith(2);
    expect(sample.setDuration).toHaveBeenCalledWith(0.02);
  });

  it("applies a static crop trajectory", async () => {
    await cutWithWebCodecs(new Blob(), {
      ...baseOptions(),
      vertical: true,
      cropTrajectory: [
        { time: 0, left: 20, top: 5 },
        { time: 2, left: 20, top: 5 },
      ],
    });

    expect(media.conversionInit.mock.calls[0][0].video.crop).toEqual({
      left: 20,
      top: 5,
      width: 608,
      height: 1080,
    });
  });

  it("draws and retimes a moving crop", async () => {
    const context = {};
    class TestCanvas {
      constructor(width, height) {
        this.width = width;
        this.height = height;
      }

      getContext() {
        return context;
      }
    }
    vi.stubGlobal("OffscreenCanvas", TestCanvas);

    await cutWithWebCodecs(new Blob(), {
      ...baseOptions(),
      vertical: true,
      playbackRate: 2,
      cropTrajectory: [
        { time: 0, left: 10, top: 0 },
        { time: 2, left: 30, top: 0 },
      ],
    });

    const video = media.conversionInit.mock.calls[0][0].video;
    const sample = {
      timestamp: 1,
      duration: 0.04,
      draw: vi.fn(),
      setTimestamp: vi.fn(),
      setDuration: vi.fn(),
    };
    const canvas = video.process(sample);
    expect(canvas).toBeInstanceOf(TestCanvas);
    expect(video).toMatchObject({ processedWidth: 608, processedHeight: 1080 });
    expect(sample.draw).toHaveBeenCalledWith(
      context,
      20,
      0,
      608,
      1080,
      0,
      0,
      608,
      1080,
    );
    expect(sample.setTimestamp).toHaveBeenCalledWith(0.5);
  });

  it("packet-copies undecodable trimmed audio and waits for it", async () => {
    media.inputState.audioTrack.canDecode.mockResolvedValue(false);
    media.packetSinkState.packets = [packet(0.98), packet(1.4), packet(3.1)];

    await cutWithWebCodecs(new Blob(), baseOptions());

    const source = media.audioSources[0];
    expect(media.outputInstances[0].addAudioTrack).toHaveBeenCalledWith(source);
    expect(source.add).toHaveBeenCalledTimes(2);
    expect(source.add.mock.calls[0][0].timestamp).toBe(0);
    expect(source.add.mock.calls[0][1]).toEqual({
      decoderConfig: { codec: "mp4a.40.2" },
    });
    expect(source.add.mock.calls[1][0].timestamp).toBeCloseTo(0.4);
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("uses OPFS for disk-backed output and exposes cleanup", async () => {
    const outputFile = new File(["mp4"], "result.mp4", {
      type: "video/mp4",
    });
    const writable = {};
    const handle = {
      createWritable: vi.fn(async () => writable),
      getFile: vi.fn(async () => outputFile),
    };
    const directory = {
      getFileHandle: vi.fn(async () => handle),
      removeEntry: vi.fn(async () => {}),
    };
    vi.stubGlobal("navigator", {
      storage: { getDirectory: vi.fn(async () => directory) },
    });
    vi.stubGlobal("crypto", { randomUUID: () => "test-id" });

    const result = await cutWithWebCodecs(new Blob(), {
      ...baseOptions(),
      diskBacked: true,
    });

    expect(result.data).toBe(outputFile);
    expect(directory.getFileHandle).toHaveBeenCalledWith(
      "turntall-output-test-id.mp4",
      { create: true },
    );
    expect(media.streamTargets[0].options).toEqual({
      chunked: true,
      chunkSize: 16 * 1024 * 1024,
    });
    await result.cleanup();
    expect(directory.removeEntry).toHaveBeenCalledWith(
      "turntall-output-test-id.mp4",
    );
  });

  it("reports rejected tracks and cleans disk-backed output", async () => {
    const removeEntry = vi.fn(async () => {});
    vi.stubGlobal("navigator", {
      storage: {
        getDirectory: vi.fn(async () => ({
          getFileHandle: vi.fn(async () => ({
            createWritable: vi.fn(async () => ({})),
            getFile: vi.fn(),
          })),
          removeEntry,
        })),
      },
    });
    media.conversion = createConversion({
      isValid: false,
      discardedTracks: [
        { reason: "discarded_by_user" },
        { reason: "unsupported_codec" },
      ],
    });

    await expect(
      cutWithWebCodecs(new Blob(), {
        ...baseOptions(),
        diskBacked: true,
      }),
    ).rejects.toThrow(
      "The browser rejected a media track: unsupported_codec.",
    );
    expect(removeEntry).toHaveBeenCalledOnce();
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });

  it("propagates conversion cancellation and disposes the input", async () => {
    let rejectExecution;
    const blockedExecution = new Promise((_, reject) => {
      rejectExecution = reject;
    });
    media.conversion = createConversion({
      execute: () => blockedExecution,
    });
    const onConversion = vi.fn();

    const cutting = cutWithWebCodecs(new Blob(), {
      ...baseOptions(),
      onConversion,
    });
    await vi.waitFor(() => {
      expect(onConversion).toHaveBeenCalledWith(media.conversion);
    });
    await media.conversion.cancel();
    rejectExecution(new DOMException("Cancelled", "AbortError"));

    await expect(cutting).rejects.toMatchObject({ name: "AbortError" });
    expect(media.conversion.cancel).toHaveBeenCalledOnce();
    expect(onConversion).toHaveBeenLastCalledWith(undefined);
    expect(media.inputInstances[0].dispose).toHaveBeenCalledOnce();
  });

  it("fails clearly when conversion creates no output", async () => {
    media.bufferResult = undefined;

    await expect(
      cutWithWebCodecs(new Blob(), baseOptions()),
    ).rejects.toThrow("The browser did not create an output video.");
  });
});
