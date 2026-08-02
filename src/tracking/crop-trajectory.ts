import { clamp } from "../media/video-utils.ts";

const TIME_EPSILON = 1e-6;
const PYTRACKER_GAUSSIAN_SIGMA = 5;
const PYTRACKER_GAUSSIAN_TRUNCATE = 4;
const PYTRACKER_MOVEMENT_THRESHOLD_PX = 15;
const MAXIMUM_CROP_SPEED_WIDTHS_PER_SECOND = 0.35;

function centeredCropPosition(
  sourceWidth,
  sourceHeight,
  cropSize,
) {
  return {
    left: (sourceWidth - cropSize.width) / 2,
    top: (sourceHeight - cropSize.height) / 2,
  };
}

export function subjectCropPosition(
  reference,
  sourceWidth,
  sourceHeight,
  cropSize,
) {
  if (!reference?.box) {
    return centeredCropPosition(
      sourceWidth,
      sourceHeight,
      cropSize,
    );
  }

  const centerX =
    (reference.box.x + reference.box.width / 2) * sourceWidth;
  const centerY =
    (reference.box.y + reference.box.height / 2) * sourceHeight;

  return {
    left: Number.isFinite(reference.cropLeft)
      ? clamp(
          reference.cropLeft,
          0,
          sourceWidth - cropSize.width,
        )
      : clamp(
          centerX - cropSize.width / 2,
          0,
          sourceWidth - cropSize.width,
        ),
    top: clamp(
      centerY - cropSize.height / 2,
      0,
      sourceHeight - cropSize.height,
    ),
  };
}

function reflectedIndex(index, length) {
  if (length <= 1) {
    return 0;
  }

  let reflected = index;
  while (reflected < 0 || reflected >= length) {
    reflected = reflected < 0
      ? -reflected - 1
      : length * 2 - reflected - 1;
  }
  return reflected;
}

function gaussianFilter1d(values, sigma) {
  if (values.length < 2 || sigma <= 0) {
    return [...values];
  }

  const radius = Math.max(
    1,
    Math.floor(PYTRACKER_GAUSSIAN_TRUNCATE * sigma + 0.5),
  );
  const weights = [];
  let weightTotal = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const weight = Math.exp(-(offset ** 2) / (2 * sigma ** 2));
    weights.push(weight);
    weightTotal += weight;
  }

  return values.map((_, index) =>
    weights.reduce((total, weight, weightIndex) => {
      const offset = weightIndex - radius;
      return total +
        values[reflectedIndex(index + offset, values.length)] *
          (weight / weightTotal);
    }, 0),
  );
}

function gaussianAutomaticLefts(points, sigma) {
  const smoothed = points.map((point) => point.left);
  let segmentStart = 0;

  const smoothSegment = (segmentEnd) => {
    const values = points
      .slice(segmentStart, segmentEnd)
      .map((point) => point.left);
    const filtered = gaussianFilter1d(values, sigma);
    for (let index = segmentStart; index < segmentEnd; index += 1) {
      smoothed[index] = filtered[index - segmentStart];
    }
  };

  for (let index = 1; index <= points.length; index += 1) {
    if (index === points.length || points[index].jump) {
      smoothSegment(index);
      segmentStart = index;
    }
  }
  if (segmentStart < points.length) {
    smoothSegment(points.length);
  }

  return smoothed;
}

function limitAutomaticCropSpeed(points, maximumSpeed) {
  if (
    points.length < 2 ||
    !Number.isFinite(maximumSpeed) ||
    maximumSpeed <= 0
  ) {
    return points.map((point) => ({ ...point }));
  }

  const limited = points.map((point) => ({ ...point }));
  const clampAutomaticPoint = (index, neighborIndex) => {
    const point = limited[index];
    const neighbor = limited[neighborIndex];
    const crossesJump =
      index > neighborIndex ? point.jump : neighbor.jump;
    if (!point.automatic || point.jump || crossesJump) {
      return false;
    }

    const elapsed = Math.abs(point.time - neighbor.time);
    if (!Number.isFinite(elapsed) || elapsed <= TIME_EPSILON) {
      return false;
    }
    const maximumDelta = maximumSpeed * elapsed;
    const nextLeft = clamp(
      point.left,
      neighbor.left - maximumDelta,
      neighbor.left + maximumDelta,
    );
    const changed = Math.abs(nextLeft - point.left) > TIME_EPSILON;
    point.left = nextLeft;
    return changed;
  };

  // Alternating passes let a future manual anchor reshape earlier automatic
  // positions instead of forcing the crop to catch up in one or two frames.
  for (let pass = 0; pass < 6; pass += 1) {
    let changed = false;
    for (let index = 1; index < limited.length; index += 1) {
      changed = clampAutomaticPoint(index, index - 1) || changed;
    }
    for (let index = limited.length - 2; index >= 0; index -= 1) {
      changed = clampAutomaticPoint(index, index + 1) || changed;
    }
    if (!changed) {
      break;
    }
  }

  return limited;
}

export function cropPositionAtTime(points, time) {
  if (!points.length) {
    return undefined;
  }
  if (points.length === 1 || time <= points[0].time) {
    return { left: points[0].left, top: points[0].top };
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (time < next.time && next.jump) {
      return { left: previous.left, top: previous.top };
    }
    if (time <= next.time) {
      const span = next.time - previous.time;
      const progress = span <= TIME_EPSILON
        ? 1
        : clamp((time - previous.time) / span, 0, 1);
      return {
        left:
          previous.left + (next.left - previous.left) * progress,
        top: previous.top + (next.top - previous.top) * progress,
      };
    }
  }

  const last = points.at(-1);
  return { left: last.left, top: last.top };
}

export function smoothAutomaticCropPositions(
  points,
  sigma = PYTRACKER_GAUSSIAN_SIGMA,
  movementThreshold = PYTRACKER_MOVEMENT_THRESHOLD_PX,
  maximumSpeed = Number.POSITIVE_INFINITY,
) {
  if (points.length < 2) {
    return points.map((point) => ({ ...point }));
  }

  const smoothedLeft = gaussianAutomaticLefts(
    points,
    Math.max(0, sigma),
  );
  const gaussianCandidates = points.map((point, index) =>
    point.automatic && !point.jump
      ? { ...point, left: smoothedLeft[index] }
      : { ...point },
  );
  const candidates = limitAutomaticCropSpeed(
    gaussianCandidates,
    maximumSpeed,
  );
  const stabilized = [{ ...candidates[0] }];
  let committedLeft = stabilized[0].left;

  for (let index = 1; index < candidates.length; index += 1) {
    const point = candidates[index];
    const automatic = point.automatic && !point.jump;
    const moved =
      Math.abs(point.left - committedLeft) >
      Math.max(0, movementThreshold);
    const isLast = index === candidates.length - 1;

    if (!automatic || moved) {
      stabilized.push({ ...point });
      committedLeft = point.left;
    } else if (isLast) {
      // pyTracker holds the last committed crop after sub-threshold motion.
      // Retain the final timestamp so the tracked range still reaches its end.
      stabilized.push({ ...point, left: committedLeft });
    }
  }

  return stabilized;
}

export function stabilizeTrackedReferences(
  references,
  {
    sourceWidth,
    sourceHeight,
    cropSize,
    sigma = PYTRACKER_GAUSSIAN_SIGMA,
    movementThreshold = undefined,
    maximumSpeed = undefined,
  },
) {
  const positioned = references.map((reference, sampleIndex) => {
    const rawReference = reference.automatic
      ? { ...reference, cropLeft: undefined }
      : reference;
    return {
      ...reference,
      sampleIndex,
      ...subjectCropPosition(
        rawReference,
        sourceWidth,
        sourceHeight,
        cropSize,
      ),
    };
  });

  return smoothAutomaticCropPositions(
    positioned,
    sigma,
    Number.isFinite(movementThreshold)
      ? movementThreshold
      : Math.max(
          PYTRACKER_MOVEMENT_THRESHOLD_PX,
          sourceWidth * 0.008,
        ),
    Number.isFinite(maximumSpeed)
      ? maximumSpeed
      : sourceWidth * MAXIMUM_CROP_SPEED_WIDTHS_PER_SECOND,
  ).map((point) => ({
    ...references[point.sampleIndex],
    cropLeft: point.left,
    stabilized: true,
  }));
}

export function createCropTrajectory(
  references,
  {
    start,
    end,
    sourceWidth,
    sourceHeight,
    cropSize,
  },
) {
  const positionedReferences = references
      .filter(
        (reference) =>
          Number.isFinite(reference.time) && reference.box,
      )
      .map((reference) => ({
        time: reference.time,
        jump: Boolean(reference.jump),
        ...(reference.automatic ? { automatic: true } : {}),
        ...subjectCropPosition(
          reference,
          sourceWidth,
          sourceHeight,
          cropSize,
        ),
      }))
      .sort((left, right) => left.time - right.time)
      .filter(
        (point, index, points) =>
          index === points.length - 1 ||
          Math.abs(point.time - points[index + 1].time) >
            TIME_EPSILON,
      );

  if (!positionedReferences.length) {
    return [
      {
        time: 0,
        ...centeredCropPosition(
          sourceWidth,
          sourceHeight,
          cropSize,
        ),
      },
    ];
  }

  const duration = Math.max(0, end - start);
  const startPosition = cropPositionAtTime(
    positionedReferences,
    start,
  );
  const endPosition = cropPositionAtTime(
    positionedReferences,
    end,
  );
  const interior = positionedReferences
    .filter(
      (point) =>
        point.time > start + TIME_EPSILON &&
        point.time < end - TIME_EPSILON,
    )
    .map((point) => ({
      ...point,
      time: point.time - start,
    }));

  return [
    { time: 0, jump: false, ...startPosition },
    ...interior,
    ...(duration > TIME_EPSILON
      ? [{ time: duration, jump: false, ...endPosition }]
      : []),
  ];
}

export function cropRectangleAtTime(
  trajectory,
  time,
  cropSize,
) {
  const position = cropPositionAtTime(trajectory, time) ?? {
    left: 0,
    top: 0,
  };

  return {
    left: Math.round(position.left),
    top: Math.round(position.top),
    width: cropSize.width,
    height: cropSize.height,
  };
}

function ffmpegNumber(value) {
  return String(Number(value.toFixed(3)));
}

function ffmpegPositionExpression(trajectory, property) {
  if (trajectory.length === 1) {
    return ffmpegNumber(trajectory[0][property]);
  }

  let expression = ffmpegNumber(trajectory.at(-1)[property]);
  for (let index = trajectory.length - 2; index >= 0; index -= 1) {
    const current = trajectory[index];
    const next = trajectory[index + 1];
    const span = next.time - current.time;
    const delta = next[property] - current[property];
    const startValue = ffmpegNumber(current[property]);
    const segment =
      next.jump ||
      Math.abs(delta) <= TIME_EPSILON ||
      span <= TIME_EPSILON
        ? startValue
        : `${startValue}${delta >= 0 ? "+" : ""}${ffmpegNumber(
            delta,
          )}*(t-${ffmpegNumber(current.time)})/${ffmpegNumber(
            span,
          )}`;
    expression = `if(lt(t\\,${ffmpegNumber(
      next.time,
    )})\\,${segment}\\,${expression})`;
  }

  return expression;
}

export function createFFmpegCropFilter(cropSize, trajectory) {
  return `crop=${cropSize.width}:${cropSize.height}:${ffmpegPositionExpression(
    trajectory,
    "left",
  )}:${ffmpegPositionExpression(trajectory, "top")}`;
}
