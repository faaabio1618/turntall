import { clamp } from "../media/video-utils.ts";

const PATCH_RADIUS = 2;
const MAX_FEATURES = 28;
const MIN_FEATURE_DISTANCE = 5;
const FORWARD_BACKWARD_ERROR_PIXELS = 2.5;

function grayscale(frame) {
  const pixels = new Uint8Array(frame.width * frame.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    pixels[index] = Math.round(
      frame.data[offset] * 0.299 +
        frame.data[offset + 1] * 0.587 +
        frame.data[offset + 2] * 0.114,
    );
  }
  return pixels;
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function featureCandidates(pixels, width, height, box) {
  const margin = PATCH_RADIUS + 1;
  const left = clamp(Math.floor(box.x * width) + margin, margin, width - margin - 1);
  const right = clamp(
    Math.ceil((box.x + box.width) * width) - margin,
    margin,
    width - margin - 1,
  );
  const top = clamp(Math.floor(box.y * height) + margin, margin, height - margin - 1);
  const bottom = clamp(
    Math.ceil((box.y + box.height) * height) - margin,
    margin,
    height - margin - 1,
  );
  const candidates = [];

  for (let y = top; y <= bottom; y += 2) {
    for (let x = left; x <= right; x += 2) {
      const horizontal =
        pixels[y * width + x + 1] - pixels[y * width + x - 1];
      const vertical =
        pixels[(y + 1) * width + x] - pixels[(y - 1) * width + x];
      const diagonalA =
        pixels[(y + 1) * width + x + 1] -
        pixels[(y - 1) * width + x - 1];
      const diagonalB =
        pixels[(y + 1) * width + x - 1] -
        pixels[(y - 1) * width + x + 1];
      const axisCorner = Math.min(
        Math.abs(horizontal),
        Math.abs(vertical),
      );
      const diagonalCorner = Math.min(
        Math.abs(diagonalA),
        Math.abs(diagonalB),
      );
      const score = Math.max(axisCorner, diagonalCorner);
      if (score >= 12) {
        candidates.push({ x, y, score });
      }
    }
  }

  candidates.sort((leftPoint, rightPoint) =>
    rightPoint.score - leftPoint.score,
  );
  const selected = [];
  for (const candidate of candidates) {
    if (
      selected.every(
        (point) =>
          (point.x - candidate.x) ** 2 +
            (point.y - candidate.y) ** 2 >=
          MIN_FEATURE_DISTANCE ** 2,
      )
    ) {
      selected.push(candidate);
      if (selected.length >= MAX_FEATURES) {
        break;
      }
    }
  }
  return selected;
}

function patchDifference(
  previous,
  current,
  width,
  sourceX,
  sourceY,
  targetX,
  targetY,
) {
  let difference = 0;
  let samples = 0;
  for (let y = -PATCH_RADIUS; y <= PATCH_RADIUS; y += 1) {
    for (let x = -PATCH_RADIUS; x <= PATCH_RADIUS; x += 1) {
      difference += Math.abs(
        previous[(sourceY + y) * width + sourceX + x] -
          current[(targetY + y) * width + targetX + x],
      );
      samples += 1;
    }
  }
  return difference / samples;
}

function matchFeature(
  previous,
  current,
  width,
  height,
  point,
  radius,
) {
  let best;
  const minX = Math.max(PATCH_RADIUS, point.x - radius);
  const maxX = Math.min(width - PATCH_RADIUS - 1, point.x + radius);
  const minY = Math.max(PATCH_RADIUS, point.y - radius);
  const maxY = Math.min(height - PATCH_RADIUS - 1, point.y + radius);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const difference = patchDifference(
        previous,
        current,
        width,
        point.x,
        point.y,
        x,
        y,
      );
      if (!best || difference < best.difference) {
        best = { x, y, difference };
      }
    }
  }
  return best;
}

function center(box) {
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

function blendBoxes(left, right, rightWeight) {
  const weight = clamp(rightWeight, 0, 1);
  return Object.fromEntries(
    ["x", "y", "width", "height"].map((property) => [
      property,
      left[property] * (1 - weight) + right[property] * weight,
    ]),
  );
}

export function trackOpticalFlow(
  previousFrame,
  currentFrame,
  previousBox,
  options: { radius?: number } = {},
) {
  if (
    !previousFrame ||
    !currentFrame ||
    previousFrame.width !== currentFrame.width ||
    previousFrame.height !== currentFrame.height
  ) {
    return { box: { ...previousBox }, confidence: 0, points: 0 };
  }

  const { width, height } = previousFrame;
  const previous = grayscale(previousFrame);
  const current = grayscale(currentFrame);
  const features = featureCandidates(
    previous,
    width,
    height,
    previousBox,
  );
  if (features.length < 3) {
    return {
      box: { ...previousBox },
      confidence: 0,
      points: features.length,
    };
  }

  const radius = Math.max(
    5,
    Math.round(
      options.radius ??
        Math.min(
          18,
          Math.max(width * previousBox.width, height * previousBox.height) * 0.2,
        ),
    ),
  );
  const matches = features
    .map((point) => {
      const match = matchFeature(
        previous,
        current,
        width,
        height,
        point,
        radius,
      );
      if (!match) {
        return undefined;
      }
      const similarity = clamp(1 - match.difference / 72, 0, 1);
      const backwardMatch = matchFeature(
        current,
        previous,
        width,
        height,
        match,
        radius,
      );
      const backwardError = backwardMatch
        ? Math.hypot(
            backwardMatch.x - point.x,
            backwardMatch.y - point.y,
          )
        : Infinity;
      const reverseConsistency = clamp(
        1 - backwardError / FORWARD_BACKWARD_ERROR_PIXELS,
        0,
        1,
      );
      return {
        source: point,
        target: match,
        dx: match.x - point.x,
        dy: match.y - point.y,
        similarity,
        backwardError,
        reverseConsistency,
      };
    })
    .filter(
      (match) =>
        match?.similarity >= 0.42 &&
        match.backwardError <= FORWARD_BACKWARD_ERROR_PIXELS,
    );

  if (matches.length < 3) {
    return {
      box: { ...previousBox },
      confidence: clamp(matches.length / features.length, 0, 0.3),
      points: matches.length,
    };
  }

  const medianDx = median(matches.map((match) => match.dx));
  const medianDy = median(matches.map((match) => match.dy));
  const tolerance = Math.max(2.5, Math.hypot(width, height) * 0.008);
  const inliers = matches.filter(
    (match) =>
      Math.hypot(match.dx - medianDx, match.dy - medianDy) <=
      tolerance,
  );
  if (inliers.length < 3) {
    return {
      box: { ...previousBox },
      confidence: clamp(inliers.length / features.length, 0, 0.3),
      points: inliers.length,
    };
  }

  const dx = median(inliers.map((match) => match.dx));
  const dy = median(inliers.map((match) => match.dy));
  const sourceCenter = {
    x: median(inliers.map((match) => match.source.x)),
    y: median(inliers.map((match) => match.source.y)),
  };
  const targetCenter = {
    x: median(inliers.map((match) => match.target.x)),
    y: median(inliers.map((match) => match.target.y)),
  };
  const scales = inliers
    .map((match) => {
      const sourceDistance = Math.hypot(
        match.source.x - sourceCenter.x,
        match.source.y - sourceCenter.y,
      );
      const targetDistance = Math.hypot(
        match.target.x - targetCenter.x,
        match.target.y - targetCenter.y,
      );
      return sourceDistance >= 4
        ? targetDistance / sourceDistance
        : undefined;
    })
    .filter((scale) => Number.isFinite(scale));
  const scale = clamp(scales.length >= 3 ? median(scales) : 1, 0.88, 1.12);
  const widthChange = previousBox.width * scale - previousBox.width;
  const heightChange = previousBox.height * scale - previousBox.height;
  const nextWidth = clamp(previousBox.width * scale, 0.02, 1);
  const nextHeight = clamp(previousBox.height * scale, 0.02, 1);
  const nextBox = {
    x: clamp(
      previousBox.x + dx / width - widthChange / 2,
      0,
      1 - nextWidth,
    ),
    y: clamp(
      previousBox.y + dy / height - heightChange / 2,
      0,
      1 - nextHeight,
    ),
    width: nextWidth,
    height: nextHeight,
  };
  const survival = inliers.length / features.length;
  const similarity = median(inliers.map((match) => match.similarity));
  const consistency = inliers.length / matches.length;
  const reverseConsistency = median(
    inliers.map((match) => match.reverseConsistency),
  );

  return {
    box: nextBox,
    confidence: clamp(
      similarity * 0.4 +
        survival * 0.3 +
        consistency * 0.15 +
        reverseConsistency * 0.15,
      0,
      1,
    ),
    points: inliers.length,
  };
}

export function selectTrackingResult(mode, templateResult, flowResult) {
  if (mode === "smooth") {
    return { ...flowResult, tracker: "smooth" };
  }
  if (mode === "large") {
    return { ...templateResult, tracker: "large" };
  }
  if (!flowResult) {
    return { ...templateResult, tracker: "large" };
  }
  if (!templateResult) {
    return { ...flowResult, tracker: "smooth" };
  }

  const templateCenter = center(templateResult.box);
  const flowCenter = center(flowResult.box);
  const agreement = Math.hypot(
    templateCenter.x - flowCenter.x,
    templateCenter.y - flowCenter.y,
  );
  const agreementLimit = Math.max(
    0.025,
    Math.min(templateResult.box.width, templateResult.box.height) * 0.3,
  );
  if (
    agreement <= agreementLimit &&
    templateResult.confidence >= 0.38 &&
    flowResult.confidence >= 0.38
  ) {
    const total = templateResult.confidence + flowResult.confidence;
    return {
      box: blendBoxes(
        templateResult.box,
        flowResult.box,
        flowResult.confidence / total,
      ),
      confidence: clamp(
        Math.max(templateResult.confidence, flowResult.confidence) + 0.05,
        0,
        1,
      ),
      tracker: "automatic",
    };
  }

  return flowResult.confidence > templateResult.confidence
    ? { ...flowResult, tracker: "smooth" }
    : { ...templateResult, tracker: "large" };
}
