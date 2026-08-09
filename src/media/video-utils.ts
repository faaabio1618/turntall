export const KEYFRAME_TOLERANCE_SECONDS = 0.025;

export function formatTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds
    .toFixed(2)
    .padStart(5, "0")}`;
}

export function formatBytes(bytes: number) {
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
  sourceName: string,
  { vertical = false, extension = "mp4" }: {
    vertical?: boolean;
    extension?: string;
  } = {},
) {
  const baseName = String(sourceName || "video").replace(/\.[^.]+$/, "");
  return `${baseName}-${vertical ? "vertical" : "cut"}.${extension}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

export function sameDisplayedTime(
  first: number | string,
  second: number | string,
) {
  const firstTime = Number(first);
  const secondTime = Number(second);

  return (
    Number.isFinite(firstTime) &&
    Number.isFinite(secondTime) &&
    firstTime.toFixed(2) === secondTime.toFixed(2)
  );
}

export function frameIndexAtTime(
  time: number | undefined,
  frameRate: number | undefined,
) {
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

export function frameNumberAtTime(
  time: number | undefined,
  frameRate: number | undefined,
) {
  const frameIndex = frameIndexAtTime(time, frameRate);
  return frameIndex === undefined ? undefined : frameIndex + 1;
}

export function sameVideoFrame(
  first: number,
  second: number,
  frameRate: number,
) {
  const firstFrame = frameIndexAtTime(first, frameRate);
  const secondFrame = frameIndexAtTime(second, frameRate);
  return firstFrame !== undefined && firstFrame === secondFrame;
}

export function presentedFrameTime(
  currentTime: number | undefined,
  mediaTime: number | undefined,
  frameRate: number | undefined,
) {
  if (!Number.isFinite(currentTime)) {
    return Number.isFinite(mediaTime) ? mediaTime : 0;
  }
  if (!Number.isFinite(mediaTime)) {
    return currentTime;
  }

  if (Number.isFinite(frameRate) && frameRate > 0) {
    const presentedFrame = frameIndexAtTime(mediaTime, frameRate);
    const playheadFrame = Math.max(
      0,
      Math.floor(currentTime * frameRate + Number.EPSILON),
    );
    return presentedFrame === playheadFrame ? mediaTime : currentTime;
  }

  return Math.abs(mediaTime - currentTime) < 1 / 30
    ? mediaTime
    : currentTime;
}

export function frameStepTime(
  currentTime: number,
  direction: number,
  frameRate: number | undefined,
  duration: number,
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

export function centeredVerticalSize(width: number, height: number) {
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

export function normalizeKeyframes(timestamps: number[], duration: number) {
  return [
    ...new Set(
      timestamps
        .filter(
          (timestamp) =>
            Number.isFinite(timestamp) &&
            timestamp >= 0 &&
            timestamp <= duration,
        )
        .map((timestamp: number) => timestamp.toFixed(6)),
    ),
  ]
    .map(Number)
    .sort((left, right) => left - right);
}

export function parseFramecrcKeyframes(report: string, duration: number) {
  const lines = report.split(/\r?\n/);
  const timeBaseMatch = lines
    .find((line: string) => line.startsWith("#tb 0:"))
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

    const fields = line.split(",").map((field: string) => field.trim());
    if (fields.length < 6 || fields[0] !== "0") {
      continue;
    }

    const flagField = fields.find((field: string) => field.startsWith("F=0x"));
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

export function keyframeBoundaries(keyframes: number[], duration: number) {
  const boundaries = keyframes.slice();

  if (
    duration > 0 &&
    !boundaries.some(
      (keyframe: number) =>
        Math.abs(keyframe - duration) <= KEYFRAME_TOLERANCE_SECONDS,
    )
  ) {
    boundaries.push(duration);
  }

  return boundaries;
}

export function nearestKeyframe(
  rawValue: number,
  duration: number,
  keyframes: number[],
) {
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
  value: number,
  kind: string,
  duration: number,
  keyframes: number[],
  tolerance = KEYFRAME_TOLERANCE_SECONDS,
) {
  if (
    (kind === "start" && value <= tolerance) ||
    (kind === "end" && Math.abs(value - duration) <= tolerance)
  ) {
    return true;
  }

  return keyframes.some(
    (keyframe: number) => Math.abs(keyframe - value) <= tolerance,
  );
}

export function suggestedTrackingFrameSkip(frameRate: number | undefined) {
  return Number.isFinite(frameRate) && frameRate > 50 ? 4 : 1;
}
