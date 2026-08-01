import { createFFmpegCropFilter } from "../tracking/crop-trajectory.ts";

export function createKeyframeScanArgs(inputName, outputName = "keyframes.txt") {
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

export function createDecodeProbeArgs(inputName) {
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
}) {
  const speedChanged = Math.abs(playbackRate - 1) > 0.000001;
  const needsDecoding = vertical || accurate || speedChanged;
  const inputArgs = needsDecoding
    ? ["-threads", "1", "-i", inputName, "-ss", start.toFixed(3)]
    : ["-ss", start.toFixed(3), "-i", inputName];
  const commonArgs = [
    ...inputArgs,
    "-t",
    ((end - start) / (speedChanged ? playbackRate : 1)).toFixed(3),
    "-map",
    "0:v:0",
    ...(keepAudio ? ["-map", "0:a?"] : ["-an"]),
  ];
  const audioEncodingArgs = keepAudio
    ? ["-c:a", "aac"]
    : [];

  const videoFilters = [];
  if (vertical) {
    videoFilters.push(
      cropTrajectory
        ? `setpts=PTS-STARTPTS,${createFFmpegCropFilter(
            cropSize,
            cropTrajectory,
          )}`
        : `crop=${cropSize.width}:${cropSize.height}:(iw-${cropSize.width})/2:(ih-${cropSize.height})/2`,
    );
  }
  if (speedChanged) {
    videoFilters.push(`setpts=(PTS-STARTPTS)/${playbackRate}`);
  }

  const encodingArgs = vertical
    ? [
        "-vf",
        videoFilters.join(","),
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
