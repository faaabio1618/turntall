export const KEYFRAME_TOLERANCE_SECONDS = 0.025;

export function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds
    .toFixed(2)
    .padStart(5, "0")}`;
}

export function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = units[0];

  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }

  return `${value.toFixed(unit === "B" ? 0 : 1)} ${unit}`;
}

export function defaultOutputFilename(
  sourceName,
  { vertical = false, extension = "mp4" } = {},
) {
  const baseName = String(sourceName || "video").replace(/\.[^.]+$/, "");
  return `${baseName}-${vertical ? "vertical" : "cut"}.${extension}`;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

export function sameDisplayedTime(first, second) {
  const firstTime = Number(first);
  const secondTime = Number(second);

  return (
    Number.isFinite(firstTime) &&
    Number.isFinite(secondTime) &&
    firstTime.toFixed(2) === secondTime.toFixed(2)
  );
}

export function frameIndexAtTime(time, frameRate) {
  const numericTime = Number(time);
  const numericFrameRate = Number(frameRate);
  if (
    !Number.isFinite(numericTime) ||
    !Number.isFinite(numericFrameRate) ||
    numericFrameRate <= 0
  ) {
    return undefined;
  }

  return Math.max(0, Math.round(numericTime * numericFrameRate));
}

export function frameNumberAtTime(time, frameRate) {
  const frameIndex = frameIndexAtTime(time, frameRate);
  return frameIndex === undefined ? undefined : frameIndex + 1;
}

export function sameVideoFrame(first, second, frameRate) {
  const firstFrame = frameIndexAtTime(first, frameRate);
  const secondFrame = frameIndexAtTime(second, frameRate);
  return firstFrame !== undefined && firstFrame === secondFrame;
}

export function presentedFrameTime(
  currentTime,
  mediaTime,
  frameRate,
) {
  if (!Number.isFinite(currentTime)) {
    return Number.isFinite(mediaTime) ? mediaTime : 0;
  }
  if (!Number.isFinite(mediaTime)) {
    return currentTime;
  }

  const frameDuration =
    Number.isFinite(frameRate) && frameRate > 0
      ? 1 / frameRate
      : 1 / 30;
  return Math.abs(mediaTime - currentTime) <= frameDuration * 1.5
    ? mediaTime
    : currentTime;
}

export function frameStepTime(
  currentTime,
  direction,
  frameRate,
  duration,
) {
  const safeFrameRate =
    Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 30;
  return clamp(
    currentTime + Math.sign(direction) / safeFrameRate,
    0,
    duration,
  );
}

export function spaceShortcutAction({
  isTracking = false,
  isSelecting = false,
  canSaveSelection = false,
  canFollow = false,
} = {}) {
  if (isTracking) {
    return "stop-following";
  }
  if (isSelecting) {
    return canSaveSelection ? "save-selection" : "none";
  }
  return canFollow ? "follow-forward" : "none";
}

export function centeredVerticalSize(width, height) {
  const targetRatio = 9 / 16;
  let cropWidth;
  let cropHeight;

  if (width / height >= targetRatio) {
    cropHeight = Math.floor(height / 2) * 2;
    cropWidth = Math.floor((cropHeight * targetRatio) / 2) * 2;
  } else {
    cropWidth = Math.floor(width / 2) * 2;
    cropHeight = Math.floor(cropWidth / targetRatio / 2) * 2;
  }

  return { width: cropWidth, height: cropHeight };
}

export function normalizeKeyframes(timestamps, duration) {
  return [
    ...new Set(
      timestamps
        .filter(
          (timestamp) =>
            Number.isFinite(timestamp) &&
            timestamp >= 0 &&
            timestamp <= duration,
        )
        .map((timestamp) => timestamp.toFixed(6)),
    ),
  ]
    .map(Number)
    .sort((left, right) => left - right);
}

export function parseFramecrcKeyframes(report, duration) {
  const lines = report.split(/\r?\n/);
  const timeBaseMatch = lines
    .find((line) => line.startsWith("#tb 0:"))
    ?.match(/#tb 0:\s*(\d+)\/(\d+)/);

  if (!timeBaseMatch) {
    return [];
  }

  const timeBase = Number(timeBaseMatch[1]) / Number(timeBaseMatch[2]);
  const timestamps = [];

  for (const line of lines) {
    if (!line || line.startsWith("#")) {
      continue;
    }

    const fields = line.split(",").map((field) => field.trim());
    if (fields.length < 6 || fields[0] !== "0") {
      continue;
    }

    const flagField = fields.find((field) => field.startsWith("F=0x"));
    const flags = flagField
      ? Number.parseInt(flagField.slice(4), 16)
      : 1;
    const pts = Number(fields[2]);

    if ((flags & 1) === 1 && Number.isFinite(pts)) {
      timestamps.push(pts * timeBase);
    }
  }

  return normalizeKeyframes(timestamps, duration);
}

export function keyframeBoundaries(keyframes, duration) {
  const boundaries = keyframes.slice();

  if (
    duration > 0 &&
    !boundaries.some(
      (keyframe) =>
        Math.abs(keyframe - duration) <= KEYFRAME_TOLERANCE_SECONDS,
    )
  ) {
    boundaries.push(duration);
  }

  return boundaries;
}

export function nearestKeyframe(rawValue, duration, keyframes) {
  const value = clamp(rawValue, 0, duration);
  const boundaries = keyframeBoundaries(keyframes, duration);

  if (!boundaries.length) {
    return value;
  }

  let nearest = boundaries[0];
  let shortestDistance = Math.abs(value - nearest);

  for (const keyframe of boundaries) {
    const distance = Math.abs(value - keyframe);
    if (distance < shortestDistance) {
      nearest = keyframe;
      shortestDistance = distance;
    }
  }

  return nearest;
}

export function isKeyframeBoundary(
  value,
  kind,
  duration,
  keyframes,
  tolerance = KEYFRAME_TOLERANCE_SECONDS,
) {
  if (
    (kind === "start" && value <= tolerance) ||
    (kind === "end" && Math.abs(value - duration) <= tolerance)
  ) {
    return true;
  }

  return keyframes.some(
    (keyframe) => Math.abs(keyframe - value) <= tolerance,
  );
}

export function suggestedTrackingFrameSkip(frameRate) {
  return Number.isFinite(frameRate) && frameRate > 50 ? 6 : 1;
}
