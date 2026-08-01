import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  StreamTarget,
  type ConversionVideoOptions,
} from "mediabunny";
import { cropRectangleAtTime } from "../tracking/crop-trajectory.ts";

interface CropSize {
  width: number;
  height: number;
}

interface WebCodecsConversionOptions {
  start?: number;
  end?: number;
  vertical: boolean;
  sourceWidth: number;
  sourceHeight: number;
  cropSize: CropSize;
  cropTrajectory?: any[];
  keepAudio?: boolean;
  playbackRate?: number;
  diskBacked?: boolean;
}

interface CutWithWebCodecsOptions extends WebCodecsConversionOptions {
  onProgress?: (progress: number) => void;
  onConversion?: (conversion: any) => void;
  onPhase?: (phase: "preparing" | "processing" | "finalizing") => void;
}

export function centeredCropRectangle(
  sourceWidth,
  sourceHeight,
  cropSize,
) {
  return {
    left: Math.floor((sourceWidth - cropSize.width) / 2),
    top: Math.floor((sourceHeight - cropSize.height) / 2),
    width: cropSize.width,
    height: cropSize.height,
  };
}

export function reportOutputFinalization(output, onFinalizing) {
  const finalize = output.finalize.bind(output);
  let reported = false;
  output.finalize = (...args) => {
    if (!reported) {
      reported = true;
      onFinalizing?.();
    }
    return finalize(...args);
  };
}

function nativeCodecsAvailable() {
  return (
    typeof VideoDecoder !== "undefined" &&
    typeof VideoEncoder !== "undefined"
  );
}

function trajectoryMoves(trajectory) {
  if (!trajectory || trajectory.length < 2) {
    return false;
  }

  const first = trajectory[0];
  return trajectory.some(
    (point) =>
      point.left !== first.left || point.top !== first.top,
  );
}

function createMovingCropProcessor(cropSize, cropTrajectory) {
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(cropSize.width, cropSize.height)
      : Object.assign(document.createElement("canvas"), {
          width: cropSize.width,
          height: cropSize.height,
        });
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("The browser cannot prepare the moving crop.");
  }

  return (sample) => {
    const crop = cropRectangleAtTime(
      cropTrajectory,
      sample.timestamp,
      cropSize,
    );
    sample.draw(
      context,
      crop.left,
      crop.top,
      crop.width,
      crop.height,
      0,
      0,
      cropSize.width,
      cropSize.height,
    );
    return canvas;
  };
}

export function retimeVideoSample(sample, playbackRate) {
  if (Math.abs(playbackRate - 1) <= 0.000001) {
    return sample;
  }
  sample.setTimestamp(sample.timestamp / playbackRate);
  sample.setDuration(sample.duration / playbackRate);
  return sample;
}

export function shouldCopyTrimmedAudioPackets({
  keepAudio,
  start,
  firstTimestamp,
  canDecode,
}) {
  return (
    keepAudio &&
    Number.isFinite(start) &&
    start > firstTimestamp &&
    !canDecode
  );
}

async function attachPacketCopiedAudio(
  conversion,
  output,
  track,
  { start, end },
) {
  const codec = await track.getCodec();
  if (!codec) {
    throw new Error("The source audio codec could not be identified.");
  }

  const source = new EncodedAudioPacketSource(codec);
  output.addAudioTrack(source);
  const sink = new EncodedPacketSink(track);
  const firstPacket = await sink.getPacket(start);
  const decoderConfig = await track.getDecoderConfig();

  // Conversion owns output.start()/finalize(). Register this packet pump
  // alongside its video work so finalization waits for copied audio too.
  conversion._trackPromises.push((async () => {
    await conversion._started;
    let packet = firstPacket;
    let first = true;

    try {
      while (
        packet &&
        packet.timestamp < end &&
        !conversion._canceled
      ) {
        const adjustedPacket = packet.clone({
          timestamp: Math.max(0, packet.timestamp - start),
        });
        await source.add(
          adjustedPacket,
          first
            ? { decoderConfig: decoderConfig ?? undefined }
            : undefined,
        );
        first = false;
        packet = await sink.getNextPacket(packet);
      }
    } finally {
      source.close();
    }
  })());
}

async function createOutputTarget(diskBacked) {
  if (!diskBacked || !navigator.storage?.getDirectory) {
    const target = new BufferTarget();
    return {
      target,
      getResult: () => target.buffer,
      cleanup: undefined,
    };
  }

  const directory = await navigator.storage.getDirectory();
  const suffix = globalThis.crypto?.randomUUID?.() ?? Date.now();
  const filename = `giftiger-output-${suffix}.mp4`;
  const handle = await directory.getFileHandle(filename, {
    create: true,
  });
  const writable = await handle.createWritable();

  return {
    target: new StreamTarget(writable, {
      chunked: true,
      chunkSize: 16 * 1024 * 1024,
    }),
    getResult: () => handle.getFile(),
    cleanup: () => directory.removeEntry(filename).catch(() => {}),
  };
}

async function createConversion(
  file: Blob,
  {
    start,
    end,
    vertical,
    sourceWidth,
    sourceHeight,
    cropSize,
    cropTrajectory,
    keepAudio = true,
    playbackRate = 1,
    diskBacked = false,
  }: WebCodecsConversionOptions,
) {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(file),
  });
  const outputTarget = await createOutputTarget(diskBacked);
  const output = new Output({
    // This is a local download, so placing MP4 metadata at the end avoids
    // buffering and rewriting every encoded media chunk at finalization.
    format: new Mp4OutputFormat({ fastStart: false }),
    target: outputTarget.target,
  });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!videoTrack) {
      return {
        input,
        ...outputTarget,
        conversion: undefined,
        valid: false,
      };
    }

    const video: ConversionVideoOptions = {
      codec: "avc",
      bitrate: QUALITY_HIGH,
      forceTranscode: true,
      hardwareAcceleration: "prefer-hardware",
    };
    const speedChanged = Math.abs(playbackRate - 1) > 0.000001;
    const outputKeepsAudio = keepAudio && !speedChanged;
    if (vertical) {
      if (trajectoryMoves(cropTrajectory)) {
        const cropProcessor = createMovingCropProcessor(
          cropSize,
          cropTrajectory,
        );
        video.process = (sample) => {
          const croppedFrame = cropProcessor(sample);
          retimeVideoSample(sample, playbackRate);
          return croppedFrame;
        };
        video.processedWidth = cropSize.width;
        video.processedHeight = cropSize.height;
      } else {
        video.crop = cropTrajectory?.length
          ? cropRectangleAtTime(cropTrajectory, 0, cropSize)
          : centeredCropRectangle(
              sourceWidth,
              sourceHeight,
              cropSize,
            );
      }
    }
    if (speedChanged && !video.process) {
      video.process = (sample) =>
        retimeVideoSample(sample, playbackRate);
    }

    const copyTrimmedAudio = Boolean(
      !speedChanged &&
        outputKeepsAudio &&
        audioTrack &&
        shouldCopyTrimmedAudioPackets({
          keepAudio: outputKeepsAudio,
          start,
          firstTimestamp: await audioTrack.getFirstTimestamp(),
          canDecode: await audioTrack.canDecode(),
        }),
    );

    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      trim:
        Number.isFinite(start) && Number.isFinite(end)
          ? { start, end }
          : undefined,
      video,
      audio:
        outputKeepsAudio && !copyTrimmedAudio ? undefined : () => [],
      showWarnings: false,
    });
    if (copyTrimmedAudio) {
      await attachPacketCopiedAudio(conversion, output, audioTrack, {
        start,
        end,
      });
    }
    const valid =
      conversion.isValid &&
      conversion.utilizedTracks.includes(videoTrack) &&
      (!outputKeepsAudio ||
        !audioTrack ||
        conversion.utilizedTracks.includes(audioTrack) ||
        copyTrimmedAudio);

    return { input, ...outputTarget, conversion, valid };
  } catch (error) {
    await output.cancel().catch(() => {});
    await outputTarget.cleanup?.();
    input.dispose();
    throw error;
  }
}

export async function canEditWithWebCodecs(
  file: Blob,
  { sourceWidth, sourceHeight, cropSize }: {
    sourceWidth: number;
    sourceHeight: number;
    cropSize: CropSize;
  },
) {
  if (!nativeCodecsAvailable()) {
    return false;
  }

  let resources;
  try {
    resources = await createConversion(file, {
      vertical: true,
      sourceWidth,
      sourceHeight,
      cropSize,
    });
    return resources.valid;
  } catch {
    return false;
  } finally {
    resources?.input.dispose();
  }
}

export async function cutWithWebCodecs(
  file: Blob,
  {
    start,
    end,
    vertical,
    sourceWidth,
    sourceHeight,
    cropSize,
    cropTrajectory,
    keepAudio,
    playbackRate,
    onProgress,
    onConversion,
    onPhase,
    diskBacked = false,
  }: CutWithWebCodecsOptions,
) {
  onPhase?.("preparing");
  const resources = await createConversion(file, {
    start,
    end,
    vertical,
    sourceWidth,
    sourceHeight,
    cropSize,
    cropTrajectory,
    keepAudio,
    playbackRate,
    diskBacked,
  });

  try {
    if (!resources.valid || !resources.conversion) {
      const rejectedTracks = resources.conversion?.discardedTracks
        .filter(({ reason }) => reason !== "discarded_by_user")
        .map(({ reason }) => reason)
        .join(", ");
      throw new Error(
        rejectedTracks
          ? `The browser rejected a media track: ${rejectedTracks}.`
          : "The browser cannot process this video.",
      );
    }

    reportOutputFinalization(resources.conversion.output, () => {
      onPhase?.("finalizing");
    });

    resources.conversion.onProgress = (progress) => {
      onProgress?.(progress);
    };
    onConversion?.(resources.conversion);
    onPhase?.("processing");
    await resources.conversion.execute();

    const data = await resources.getResult();
    if (!data) {
      throw new Error("The browser did not create an output video.");
    }

    return { data, cleanup: resources.cleanup };
  } catch (error) {
    await resources.cleanup?.();
    throw error;
  } finally {
    onConversion?.(undefined);
    resources.input.dispose();
  }
}
