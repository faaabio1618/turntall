import {
  createFFmpegCropFilter,
  MAX_FFMPEG_CROP_TRAJECTORY_POINTS,
} from "../tracking/crop-trajectory.ts";
import type { CropPoint, CropSize } from "../tracking/types.ts";

function ffmpegTime(value: number) {
  return String(Number(value.toFixed(3)));
}

export function createSegmentedCropFilterGraph(
  cropSize: CropSize,
  trajectory: CropPoint[],
  playbackRate = 1,
  maximumPoints = MAX_FFMPEG_CROP_TRAJECTORY_POINTS,
) {
  const segments: CropPoint[][] = [];
  for (
    let firstIndex = 0;
    firstIndex < trajectory.length - 1;
    firstIndex += maximumPoints - 1
  ) {
    segments.push(
      trajectory.slice(
        firstIndex,
        Math.min(firstIndex + maximumPoints, trajectory.length),
      ),
    );
  }

  const inputLabels = segments.map((_, index) => `[crop-in-${index}]`);
  const outputLabels = segments.map((_, index) => `[crop-out-${index}]`);
  const filters = [
    `[0:v:0]scale=trunc(iw*sar/2)*2:ih,setsar=1,split=${segments.length}${inputLabels.join("")}`,
    ...segments.map((segment, index) => {
      const segmentStart = segment[0].time;
      const segmentEnd = segment.at(-1).time;
      return `${inputLabels[index]}trim=start=${ffmpegTime(segmentStart)}:end=${ffmpegTime(segmentEnd)},${createFFmpegCropFilter(cropSize, segment)},setpts=PTS-STARTPTS${outputLabels[index]}`;
    }),
  ];
  const speedFilter = Math.abs(playbackRate - 1) > 0.000001
    ? `,setpts=(PTS-STARTPTS)/${playbackRate}`
    : "";
  filters.push(
    `${outputLabels.join("")}concat=n=${segments.length}:v=1:a=0${speedFilter}[crop-output]`,
  );
  return filters.join(";");
}

export function createKeyframeScanArgs(inputName: string, outputName = "keyframes.txt") {
  return [
    "-hide_banner",
    "-i",
    inputName,
    "-map",
    "0:v:0",
    "-c:v",
    "copy",
    "-f",
    "framecrc",
    "-y",
    outputName,
  ];
}

export function createDecodeProbeArgs(inputName: string) {
  return [
    "-hide_banner",
    "-v",
    "error",
    "-threads",
    "1",
    "-i",
    inputName,
    "-map",
    "0:v:0",
    "-frames:v",
    "1",
    "-f",
    "null",
    "-",
  ];
}

export function createCutArgs({
  inputName,
  outputName,
  start,
  end,
  vertical,
  cropSize,
  cropTrajectory,
  accurate,
  keepAudio = true,
  playbackRate = 1,
  segmentCropTrajectory = false,
}: {
  inputName: string;
  outputName: string;
  start: number;
  end: number;
  vertical: boolean;
  cropSize: CropSize;
  cropTrajectory?: CropPoint[];
  accurate: boolean;
  keepAudio?: boolean;
  playbackRate?: number;
  segmentCropTrajectory?: boolean;
}) {
  const speedChanged = Math.abs(playbackRate - 1) > 0.000001;
  const needsDecoding = vertical || accurate || speedChanged;
  const transformsVideo = vertical || speedChanged;
  const inputArgs = transformsVideo
    ? ["-threads", "1", "-ss", start.toFixed(3), "-i", inputName]
    : needsDecoding
      ? ["-threads", "1", "-i", inputName, "-ss", start.toFixed(3)]
    : ["-ss", start.toFixed(3), "-i", inputName];
  const audioEncodingArgs = keepAudio
    ? ["-c:a", "aac"]
    : [];
  const segmentedCropGraph =
    vertical &&
    segmentCropTrajectory &&
    cropTrajectory &&
    cropTrajectory.length > MAX_FFMPEG_CROP_TRAJECTORY_POINTS
      ? createSegmentedCropFilterGraph(
          cropSize,
          cropTrajectory,
          playbackRate,
        )
      : undefined;
  const commonArgs = [
    ...inputArgs,
    "-t",
    ((end - start) / (speedChanged ? playbackRate : 1)).toFixed(3),
    "-map",
    segmentedCropGraph ? "[crop-output]" : "0:v:0",
    ...(keepAudio ? ["-map", "0:a?"] : ["-an"]),
  ];

  const videoFilters = [];
  if (vertical) {
    // Browser previews work in square-pixel display coordinates (for example,
    // Chrome exposes a 1440x1080, SAR 4:3 source as 1920x1080). Normalize the
    // decoded frame to that same coordinate system before applying crop
    // positions calculated by the preview and tracker.
    videoFilters.push("scale=trunc(iw*sar/2)*2:ih", "setsar=1");
    videoFilters.push(
      cropTrajectory
        ? createFFmpegCropFilter(
            cropSize,
            cropTrajectory,
          )
        : `crop=${cropSize.width}:${cropSize.height}:(iw-${cropSize.width})/2:(ih-${cropSize.height})/2`,
    );
  }
  if (speedChanged) {
    videoFilters.push(`setpts=(PTS-STARTPTS)/${playbackRate}`);
  } else if (vertical) {
    // Evaluate moving-crop decisions on the seek-relative input timestamps,
    // then normalize the completed video. Resetting PTS before crop evaluation
    // can leave the old crop on the first frame of a new-position jump.
    videoFilters.push("setpts=PTS-STARTPTS");
  }

  const encodingArgs = vertical
    ? [
        ...(segmentedCropGraph
          ? ["-filter_complex", segmentedCropGraph]
          : ["-vf", videoFilters.join(",")]),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        ...audioEncodingArgs,
      ]
    : accurate || speedChanged
      ? [
          ...(speedChanged ? ["-vf", videoFilters.join(",")] : []),
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "23",
          ...audioEncodingArgs,
        ]
      : ["-c", "copy", "-avoid_negative_ts", "make_zero"];

  return [...commonArgs, ...encodingArgs, "-y", outputName];
}
