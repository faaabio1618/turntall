// ffmpeg.wasm has a 32-bit address space and prepareInput also creates an
// ArrayBuffer copy before writing to its virtual file system. Keep large
// sources out of that path and let Mediabunny read only the Blob slices it
// needs instead.
export const MAX_WASM_INPUT_BYTES = 1024 ** 3;

export const MEDIA_LOADING_STRATEGY = Object.freeze({
  MEMORY: "memory",
  STREAMING: "streaming",
});

export function requiresStreamingInput(
  fileSize,
  limit = MAX_WASM_INPUT_BYTES,
) {
  return Number.isFinite(fileSize) && fileSize > limit;
}

export function mediaLoadingStrategy(
  fileSize,
  limit = MAX_WASM_INPUT_BYTES,
) {
  return requiresStreamingInput(fileSize, limit)
    ? MEDIA_LOADING_STRATEGY.STREAMING
    : MEDIA_LOADING_STRATEGY.MEMORY;
}

export function containerNamesForFilename(filename) {
  const extension = filename
    .toLowerCase()
    .match(/\.([a-z0-9]{1,5})$/)?.[1];

  if (["mp4", "m4v", "m4a", "3gp"].includes(extension)) {
    return ["mov", "mp4"];
  }
  if (extension === "mov") {
    return ["mov"];
  }
  if (extension === "webm") {
    return ["matroska", "webm"];
  }
  if (extension === "mkv") {
    return ["matroska"];
  }

  return extension ? [extension] : [];
}

function ffmpegVideoCodec(codec) {
  return codec === "avc" ? "h264" : codec;
}

function assertCurrent(isCancelled) {
  if (isCancelled?.()) {
    throw new DOMException("Video preparation cancelled.", "AbortError");
  }
}

export async function analyzeStreamingMedia(
  file,
  { isCancelled, onKeyframe } = {},
) {
  const { ALL_FORMATS, BlobSource, EncodedPacketSink, Input } =
    await import("mediabunny");
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });

  try {
    assertCurrent(isCancelled);
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!videoTrack) {
      return {
        readable: false,
        containerNames: containerNamesForFilename(file.name),
        keyframes: [],
      };
    }

    const [duration, videoCodec, audioCodec, width, height, stats] =
      await Promise.all([
        input.getDurationFromMetadata(),
        videoTrack.getCodec(),
        audioTrack?.getCodec(),
        videoTrack.getDisplayWidth(),
        videoTrack.getDisplayHeight(),
        videoTrack.computePacketStats(240, { metadataOnly: true }),
      ]);
    assertCurrent(isCancelled);

    const sink = new EncodedPacketSink(videoTrack);
    const keyframes = [];
    const options = { metadataOnly: true };
    let packet = await sink.getFirstKeyPacket(options);
    while (packet) {
      assertCurrent(isCancelled);
      if (Number.isFinite(packet.timestamp) && packet.timestamp >= 0) {
        keyframes.push(packet.timestamp);
        onKeyframe?.(packet.timestamp, duration);
      }
      packet = await sink.getNextKeyPacket(packet, options);
    }

    return {
      readable: Boolean(videoCodec),
      containerNames: containerNamesForFilename(file.name),
      videoCodec: ffmpegVideoCodec(videoCodec),
      audioCodec: audioCodec ?? undefined,
      duration: duration ?? undefined,
      width,
      height,
      frameRate: stats.averagePacketRate,
      keyframes,
    };
  } finally {
    input.dispose();
  }
}
