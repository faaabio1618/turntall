import { clamp } from "./video-utils.js";

const DEFAULT_GRID_SIZE = 18;

function pixelBox(box, width, height) {
  const left = clamp(Math.round(box.x * width), 0, width - 1);
  const top = clamp(Math.round(box.y * height), 0, height - 1);
  const boxWidth = clamp(
    Math.round(box.width * width),
    2,
    width - left,
  );
  const boxHeight = clamp(
    Math.round(box.height * height),
    2,
    height - top,
  );

  return { left, top, width: boxWidth, height: boxHeight };
}

function lumaAt(frame, x, y) {
  const clampedX = clamp(Math.round(x), 0, frame.width - 1);
  const clampedY = clamp(Math.round(y), 0, frame.height - 1);
  const offset = (clampedY * frame.width + clampedX) * 4;
  const { data } = frame;
  return (
    data[offset] * 0.299 +
    data[offset + 1] * 0.587 +
    data[offset + 2] * 0.114
  );
}

function sampleBox(frame, box, columns, rows) {
  const values = new Float32Array(columns * rows);
  let total = 0;
  let totalSquared = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = box.left + ((column + 0.5) / columns) * box.width;
      const y = box.top + ((row + 0.5) / rows) * box.height;
      const value = lumaAt(frame, x, y);
      const index = row * columns + column;
      values[index] = value;
      total += value;
      totalSquared += value * value;
    }
  }

  const mean = total / values.length;
  const variance = Math.max(
    0,
    totalSquared / values.length - mean * mean,
  );
  return { values, mean, deviation: Math.sqrt(variance) };
}

function normalizedError(template, candidate) {
  let error = 0;
  const templateScale = Math.max(12, template.deviation);
  const candidateScale = Math.max(12, candidate.deviation);

  for (let index = 0; index < template.values.length; index += 1) {
    const templateValue =
      (template.values[index] - template.mean) / templateScale;
    const candidateValue =
      (candidate.values[index] - candidate.mean) / candidateScale;
    error += Math.abs(templateValue - candidateValue);
  }

  return error / template.values.length;
}

function candidateAt(frame, template, left, top) {
  const box = {
    left: clamp(
      Math.round(left),
      0,
      frame.width - template.pixelWidth,
    ),
    top: clamp(
      Math.round(top),
      0,
      frame.height - template.pixelHeight,
    ),
    width: template.pixelWidth,
    height: template.pixelHeight,
  };
  const sample = sampleBox(
    frame,
    box,
    template.columns,
    template.rows,
  );
  return {
    box,
    sample,
    error: normalizedError(template, sample),
  };
}

function searchCandidates(
  frame,
  template,
  previous,
  radiusX,
  radiusY,
  step,
) {
  const candidates = [];
  const minLeft = Math.max(0, previous.left - radiusX);
  const maxLeft = Math.min(
    frame.width - template.pixelWidth,
    previous.left + radiusX,
  );
  const minTop = Math.max(0, previous.top - radiusY);
  const maxTop = Math.min(
    frame.height - template.pixelHeight,
    previous.top + radiusY,
  );

  for (let top = minTop; top <= maxTop; top += step) {
    for (let left = minLeft; left <= maxLeft; left += step) {
      candidates.push(candidateAt(frame, template, left, top));
    }
  }

  candidates.push(
    candidateAt(frame, template, previous.left, previous.top),
  );
  candidates.sort((left, right) => left.error - right.error);
  return candidates;
}

export function createTrackingTemplate(
  frame,
  normalizedBox,
  gridSize = DEFAULT_GRID_SIZE,
) {
  const box = pixelBox(normalizedBox, frame.width, frame.height);
  const columns = clamp(gridSize, 6, Math.max(6, box.width));
  const rows = clamp(
    Math.round((columns * box.height) / box.width),
    6,
    Math.max(6, box.height),
  );
  const sample = sampleBox(frame, box, columns, rows);

  return {
    ...sample,
    columns,
    rows,
    pixelWidth: box.width,
    pixelHeight: box.height,
  };
}

export function trackTemplate(
  frame,
  template,
  previousNormalizedBox,
  options = {},
) {
  const previous = pixelBox(
    previousNormalizedBox,
    frame.width,
    frame.height,
  );
  const radiusX = Math.round(
    options.radiusX ??
      Math.max(template.pixelWidth * 0.85, frame.width * 0.035),
  );
  const radiusY = Math.round(
    options.radiusY ??
      Math.max(template.pixelHeight * 0.85, frame.height * 0.05),
  );
  const coarseStep = Math.max(
    2,
    Math.round(
      options.step ??
        Math.min(template.pixelWidth, template.pixelHeight) / 7,
    ),
  );
  const coarse = searchCandidates(
    frame,
    template,
    previous,
    radiusX,
    radiusY,
    coarseStep,
  );
  const coarseBest = coarse[0];
  const fineStep = Math.max(1, Math.floor(coarseStep / 3));
  const fine = searchCandidates(
    frame,
    template,
    coarseBest.box,
    coarseStep,
    coarseStep,
    fineStep,
  );
  const best = fine[0];
  const alternatives = [...coarse, ...fine]
    .filter(
      (candidate) =>
        Math.abs(candidate.box.left - best.box.left) >= coarseStep ||
        Math.abs(candidate.box.top - best.box.top) >= coarseStep,
    )
    .sort((left, right) => left.error - right.error);
  const secondError = alternatives[0]?.error ?? best.error + 0.1;
  const appearance = clamp(1 - best.error / 1.25, 0, 1);
  const separation = clamp(
    (secondError - best.error) / Math.max(0.08, secondError),
    0,
    1,
  );
  const texture = clamp(template.deviation / 28, 0, 1);
  const confidence = clamp(
    appearance * 0.68 + separation * 0.2 + texture * 0.12,
    0,
    1,
  );

  return {
    box: {
      x: best.box.left / frame.width,
      y: best.box.top / frame.height,
      width: template.pixelWidth / frame.width,
      height: template.pixelHeight / frame.height,
    },
    confidence,
    error: best.error,
  };
}

export function updateTrackingTemplate(
  template,
  frame,
  normalizedBox,
  amount = 0.08,
) {
  const box = pixelBox(normalizedBox, frame.width, frame.height);
  const sample = sampleBox(
    frame,
    box,
    template.columns,
    template.rows,
  );
  const blend = clamp(amount, 0, 1);
  const values = new Float32Array(template.values.length);

  for (let index = 0; index < values.length; index += 1) {
    values[index] =
      template.values[index] * (1 - blend) +
      sample.values[index] * blend;
  }

  return {
    ...template,
    values,
    mean: template.mean * (1 - blend) + sample.mean * blend,
    deviation:
      template.deviation * (1 - blend) +
      sample.deviation * blend,
  };
}

export function trackingWaitMilliseconds(
  frameIntervalSeconds,
  playbackSpeed,
  elapsedMilliseconds = 0,
) {
  const safeSpeed =
    Number.isFinite(playbackSpeed) && playbackSpeed > 0
      ? playbackSpeed
      : 1;
  return Math.max(
    0,
    (frameIntervalSeconds * 1000) / safeSpeed -
      elapsedMilliseconds,
  );
}

export function trackingFrameInterval(
  frameRate,
  frameSkip = 1,
  fallbackFrameRate = 30,
) {
  const safeFrameRate =
    Number.isFinite(frameRate) && frameRate > 0
      ? frameRate
      : fallbackFrameRate;
  const safeFrameSkip =
    Number.isFinite(frameSkip) && frameSkip >= 1
      ? Math.floor(frameSkip)
      : 1;
  return safeFrameSkip / safeFrameRate;
}

export function trackingConfidenceHue(
  confidence,
  threshold = 0.38,
) {
  const safeThreshold = clamp(threshold, 0, 0.99);
  const safeConfidence = clamp(confidence, 0, 1);
  if (safeConfidence <= safeThreshold) {
    return 0;
  }
  return (
    120 *
    ((safeConfidence - safeThreshold) / (1 - safeThreshold))
  );
}

export function nearestTrackingConfidencePoint(points, time) {
  if (!points?.length || !Number.isFinite(time)) {
    return undefined;
  }

  return points.reduce((nearest, point) =>
    Math.abs(point.time - time) < Math.abs(nearest.time - time)
      ? point
      : nearest,
  );
}
