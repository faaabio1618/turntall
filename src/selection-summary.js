import { formatTime, isKeyframeBoundary } from "./video-utils.js";

function timingDescription({
  vertical,
  snapToKeyframes,
  keyframes,
  keyframeAligned,
}) {
  if (vertical) {
    return " · Vertical output";
  }
  if (!snapToKeyframes) {
    return " · Exact timing";
  }
  if (keyframes.length === 0) {
    return "";
  }
  return keyframeAligned
    ? " · Fast cut ready"
    : " · Move both edges to orange marks for a fast cut";
}

export function describeSelection({
  start,
  end,
  duration,
  vertical,
  snapToKeyframes,
  keyframes,
  keepAudio,
  videoSpeed,
}) {
  const length = end - start;
  const valid =
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end <= duration &&
    length > 0;

  if (!valid) {
    return {
      valid,
      text: "End time must be after start time and within the video.",
    };
  }

  const keyframeAligned =
    isKeyframeBoundary(start, "start", duration, keyframes) &&
    isKeyframeBoundary(end, "end", duration, keyframes);
  const speedDescription =
    videoSpeed === 1
      ? ""
      : ` · ${Number(videoSpeed.toFixed(2))}× (${formatTime(
          length / videoSpeed,
        )})`;
  const timing = timingDescription({
    vertical,
    snapToKeyframes,
    keyframes,
    keyframeAligned,
  });
  const audio = keepAudio ? "" : " · No audio";

  return {
    valid,
    text:
      `Selected: ${formatTime(start)} → ${formatTime(end)} ` +
      `(${formatTime(length)})${speedDescription}${timing}${audio}`,
  };
}
