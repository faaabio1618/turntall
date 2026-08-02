import {
  clamp,
  frameIndexAtTime,
  sameDisplayedTime,
  sameVideoFrame,
} from "../media/video-utils.ts";

export const MIN_SUBJECT_BOX_SIZE = 0.04;

export function containedMediaRect(
  containerWidth,
  containerHeight,
  mediaWidth,
  mediaHeight,
) {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    mediaWidth <= 0 ||
    mediaHeight <= 0
  ) {
    return {
      left: 0,
      top: 0,
      width: Math.max(0, containerWidth),
      height: Math.max(0, containerHeight),
    };
  }

  const scale = Math.min(
    containerWidth / mediaWidth,
    containerHeight / mediaHeight,
  );
  const width = mediaWidth * scale;
  const height = mediaHeight * scale;

  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function normalizedPoint(clientX, clientY, rect) {
  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1),
  };
}

export function boxFromPoints(start, end) {
  const left = clamp(Math.min(start.x, end.x), 0, 1);
  const top = clamp(Math.min(start.y, end.y), 0, 1);
  const right = clamp(Math.max(start.x, end.x), 0, 1);
  const bottom = clamp(Math.max(start.y, end.y), 0, 1);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function moveBox(box, deltaX, deltaY) {
  return {
    ...box,
    x: clamp(box.x + deltaX, 0, 1 - box.width),
    y: clamp(box.y + deltaY, 0, 1 - box.height),
  };
}

export function resizeBox(
  box,
  handle,
  deltaX,
  deltaY,
  minimumSize = MIN_SUBJECT_BOX_SIZE,
) {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;

  if (handle.includes("w")) {
    left = clamp(left + deltaX, 0, right - minimumSize);
  }
  if (handle.includes("e")) {
    right = clamp(right + deltaX, left + minimumSize, 1);
  }
  if (handle.includes("n")) {
    top = clamp(top + deltaY, 0, bottom - minimumSize);
  }
  if (handle.includes("s")) {
    bottom = clamp(bottom + deltaY, top + minimumSize, 1);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function isValidSubjectBox(
  box,
  minimumSize = MIN_SUBJECT_BOX_SIZE,
) {
  const epsilon = 1e-9;

  return Boolean(
    box &&
      Number.isFinite(box.x) &&
      Number.isFinite(box.y) &&
      Number.isFinite(box.width) &&
      Number.isFinite(box.height) &&
      box.x >= 0 &&
      box.y >= 0 &&
      box.width + epsilon >= minimumSize &&
      box.height + epsilon >= minimumSize &&
      box.x + box.width <= 1 + epsilon &&
      box.y + box.height <= 1 + epsilon,
  );
}

export function subjectTimeBounds(references) {
  const times = (references ?? [])
    .map(({ time }) => time)
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => left - right);

  if (times.length === 0) {
    return undefined;
  }

  return {
    start: times[0],
    end:
      times.length >= 2 && times.at(-1) > times[0]
        ? times.at(-1)
        : undefined,
  };
}

export function alignTimeToSubjectFrame(
  references,
  time,
  frameRate,
) {
  const frame = frameIndexAtTime(time, frameRate);
  if (frame === undefined) {
    return time;
  }

  const matchingReference = (references ?? [])
    .filter(
      (reference) =>
        Number.isFinite(reference.time) &&
        frameIndexAtTime(reference.time, frameRate) === frame,
    )
    .sort(
      (left, right) =>
        Math.abs(left.time - time) - Math.abs(right.time - time),
    )[0];

  return matchingReference?.time ?? time;
}

export function subjectBoxAtTime(references, time, jumpTolerance = 0) {
  const points = (references ?? [])
    .filter(
      (reference) =>
        Number.isFinite(reference.time) && reference.box,
    )
    .sort((left, right) => left.time - right.time);

  if (points.length === 0) {
    return undefined;
  }
  if (time < points[0].time - jumpTolerance) {
    return undefined;
  }
  if (time > points.at(-1).time + jumpTolerance) {
    return undefined;
  }
  if (points.length === 1 || time <= points[0].time) {
    return { ...points[0].box };
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (time < next.time && next.jump) {
      return time >= next.time - jumpTolerance
        ? { ...next.box }
        : { ...previous.box };
    }
    if (time <= next.time) {
      const span = next.time - previous.time;
      const progress =
        span <= 1e-6
          ? 1
          : clamp((time - previous.time) / span, 0, 1);
      return Object.fromEntries(
        ["x", "y", "width", "height"].map((property) => [
          property,
          previous.box[property] +
            (next.box[property] - previous.box[property]) *
              progress,
        ]),
      );
    }
  }

  return { ...points.at(-1).box };
}

export function subjectReferencesAfter(
  references,
  time,
  excludedId,
  tolerance = 0.005,
  frameRate = undefined,
) {
  const selectedFrame = frameIndexAtTime(time, frameRate);
  return (references ?? []).filter(
    (reference) => {
      if (
        reference.id === excludedId ||
        !Number.isFinite(reference.time)
      ) {
        return false;
      }
      const referenceFrame = frameIndexAtTime(
        reference.time,
        frameRate,
      );
      return selectedFrame !== undefined && referenceFrame !== undefined
        ? referenceFrame > selectedFrame
        : reference.time > time + tolerance;
    },
  );
}

export function subjectReferencesNeedingDecision(
  references,
  time,
  excludedId,
  frameRate,
) {
  const laterReferences = subjectReferencesAfter(
    references,
    time,
    excludedId,
    0.005,
    frameRate,
  );
  const finalReference = (references ?? [])
    .filter((reference) => Number.isFinite(reference.time))
    .sort((left, right) => left.time - right.time)
    .at(-1);
  const selectedFrame = frameIndexAtTime(time, frameRate);
  const finalFrame = frameIndexAtTime(
    finalReference?.time,
    frameRate,
  );

  return laterReferences.filter(
    (reference) =>
      !(
        reference.id === finalReference?.id &&
        reference.automatic === true &&
        (selectedFrame !== undefined && finalFrame !== undefined
          ? finalFrame - selectedFrame <= 1
          : reference.time - time <= 1 / 30)
      ),
  );
}

export function subjectReferenceAtTime(
  references,
  time,
  {
    duration,
    frameRate,
  }: { duration?: number; frameRate?: number } = {},
) {
  const candidates = (references ?? [])
    .filter((reference) => Number.isFinite(reference.time))
    .sort((left, right) => left.time - right.time);
  const lastReference = candidates.at(-1);
  const selectedFrame = frameIndexAtTime(time, frameRate);
  const lastFrame = frameIndexAtTime(lastReference?.time, frameRate);
  const durationFrame = frameIndexAtTime(duration, frameRate);
  const isTerminalTrackedFrame =
    lastReference?.automatic === true &&
    (lastFrame !== undefined && durationFrame !== undefined
      ? lastFrame === durationFrame &&
        selectedFrame !== undefined &&
        lastFrame - selectedFrame === 1
      : Number.isFinite(duration) &&
        Math.abs(duration - lastReference.time) <= 1 / 30 &&
        time < lastReference.time &&
        lastReference.time - time <= 1 / 30);

  if (isTerminalTrackedFrame) {
    return lastReference;
  }

  return candidates.find((reference) =>
    Number.isFinite(frameRate) && frameRate > 0
      ? sameVideoFrame(reference.time, time, frameRate)
      : sameDisplayedTime(reference.time, time),
  );
}

export function trackingRestartRequiresDecision(
  references,
  currentTime,
  frameRate,
  tolerance = 0.005,
  stoppedFrameTime = undefined,
) {
  const currentFrame = frameIndexAtTime(currentTime, frameRate);
  const stoppedFrame = frameIndexAtTime(stoppedFrameTime, frameRate);
  const isStoppedFrame =
    currentFrame !== undefined && stoppedFrame !== undefined
      ? currentFrame === stoppedFrame
      : Number.isFinite(currentTime) &&
        Number.isFinite(stoppedFrameTime) &&
        Math.abs(currentTime - stoppedFrameTime) <= tolerance;
  if (isStoppedFrame) {
    return false;
  }

  return (
    Number.isFinite(currentTime) &&
    (references ?? []).some(
      (reference) => {
        if (
          reference.automatic !== true ||
          !Number.isFinite(reference.time)
        ) {
          return false;
        }
        const referenceFrame = frameIndexAtTime(
          reference.time,
          frameRate,
        );
        return currentFrame !== undefined && referenceFrame !== undefined
          ? referenceFrame > currentFrame
          : reference.time > currentTime + tolerance;
      },
    )
  );
}

export function isSceneJumpSuggestion(
  suggestedTime,
  selectionTime,
  tolerance = 0.12,
) {
  return (
    Number.isFinite(suggestedTime) &&
    Number.isFinite(selectionTime) &&
    Math.abs(suggestedTime - selectionTime) <= tolerance
  );
}

export function isDistantSubjectPosition(
  previousBox,
  nextBox,
  threshold = 0.1,
) {
  if (
    !previousBox ||
    !nextBox ||
    !Number.isFinite(threshold) ||
    threshold < 0
  ) {
    return false;
  }

  const previousCenterX = previousBox.x + previousBox.width / 2;
  const nextCenterX = nextBox.x + nextBox.width / 2;

  return Math.abs(nextCenterX - previousCenterX) >= threshold;
}

export function replaceSubjectReference(
  references,
  replacement,
  deleteFollowing = false,
  tolerance = 0.005,
  frameRate = undefined,
) {
  const replacementFrame = frameIndexAtTime(
    replacement?.time,
    frameRate,
  );
  return [
    ...(references ?? []).filter(
      (reference) => {
        if (reference.id === replacement.id) {
          return false;
        }
        if (!deleteFollowing) {
          return true;
        }
        const referenceFrame = frameIndexAtTime(
          reference.time,
          frameRate,
        );
        return replacementFrame !== undefined && referenceFrame !== undefined
          ? referenceFrame <= replacementFrame
          : reference.time <= replacement.time + tolerance;
      },
    ),
    replacement,
  ].sort((left, right) => left.time - right.time);
}
