import {
  createCropTrajectory,
  cropRectangleAtTime,
} from "./crop-trajectory.js";
import { centeredVerticalSize, clamp } from "./video-utils.js";

export function fitPreviewCanvas(
  width,
  height,
  maxDimension = 720,
) {
  if (width <= 0 || height <= 0 || maxDimension <= 0) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(
    1,
    maxDimension / width,
    maxDimension / height,
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function outputPreviewCanDraw({
  readyState,
  seeking,
  framePresented,
}) {
  return readyState >= 2 && !seeking && framePresented;
}

export function outputPreviewFrame({
  vertical,
  references,
  start,
  end,
  currentTime,
  sourceWidth,
  sourceHeight,
}) {
  if (!vertical) {
    return {
      left: 0,
      top: 0,
      width: sourceWidth,
      height: sourceHeight,
    };
  }

  const cropSize = centeredVerticalSize(sourceWidth, sourceHeight);
  const trajectory = createCropTrajectory(references, {
    start,
    end,
    sourceWidth,
    sourceHeight,
    cropSize,
  });
  return cropRectangleAtTime(
    trajectory,
    clamp(currentTime - start, 0, end - start),
    cropSize,
  );
}

export function processingPreviewTime({
  start,
  end,
  progress,
}) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    !Number.isFinite(progress)
  ) {
    return undefined;
  }

  return start + (end - start) * clamp(progress, 0, 1);
}
