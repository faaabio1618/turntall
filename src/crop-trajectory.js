import { clamp } from "./video-utils.js";

const TIME_EPSILON = 1e-6;

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
    left: clamp(
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
  strength = 0.45,
) {
  const safeStrength = clamp(strength, 0, 1);

  return points.map((point, index) => {
    if (!point.automatic || point.jump) {
      return { ...point };
    }

    const previous = points[index - 1];
    const next = points[index + 1];
    if (!previous || next?.jump) {
      return { ...point };
    }

    const neighbors = [previous, next].filter(Boolean);
    const neighborLeft =
      neighbors.reduce((total, item) => total + item.left, 0) /
      neighbors.length;
    const neighborTop =
      neighbors.reduce((total, item) => total + item.top, 0) /
      neighbors.length;

    return {
      ...point,
      left:
        point.left * (1 - safeStrength) +
        neighborLeft * safeStrength,
      top:
        point.top * (1 - safeStrength) +
        neighborTop * safeStrength,
    };
  });
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
  const positionedReferences = smoothAutomaticCropPositions(
    references
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
      ),
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
