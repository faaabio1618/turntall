import { clamp } from "./video-utils.js";

export const DEFAULT_SCENE_CHANGE_THRESHOLD = 30;
export const DEFAULT_SCENE_CHANGED_RATIO = 0.55;

function rgbToHsv(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const range = maximum - minimum;
  let hue = 0;

  if (range > 0) {
    if (maximum === r) {
      hue = 60 * (((g - b) / range) % 6);
    } else if (maximum === g) {
      hue = 60 * ((b - r) / range + 2);
    } else {
      hue = 60 * ((r - g) / range + 4);
    }
  }
  if (hue < 0) {
    hue += 360;
  }

  return {
    // OpenCV stores HSV hue in the range 0..179.
    hue: hue / 2,
    saturation: maximum === 0 ? 0 : (range / maximum) * 255,
    luminance: maximum * 255,
  };
}

export function sceneChangeScore(
  previousFrame,
  currentFrame,
  options = {},
) {
  if (
    !previousFrame ||
    !currentFrame ||
    previousFrame.width !== currentFrame.width ||
    previousFrame.height !== currentFrame.height
  ) {
    return {
      detected: false,
      score: 0,
      changedRatio: 0,
    };
  }

  const threshold =
    options.threshold ?? DEFAULT_SCENE_CHANGE_THRESHOLD;
  const minimumChangedRatio =
    options.minimumChangedRatio ?? DEFAULT_SCENE_CHANGED_RATIO;
  const targetSamples = Math.max(256, options.targetSamples ?? 2304);
  const step = Math.max(
    1,
    Math.floor(
      Math.sqrt(
        (previousFrame.width * previousFrame.height) / targetSamples,
      ),
    ),
  );
  let hueDifference = 0;
  let saturationDifference = 0;
  let luminanceDifference = 0;
  let changedPixels = 0;
  let samples = 0;

  for (let y = Math.floor(step / 2); y < previousFrame.height; y += step) {
    for (let x = Math.floor(step / 2); x < previousFrame.width; x += step) {
      const offset = (y * previousFrame.width + x) * 4;
      const previous = rgbToHsv(
        previousFrame.data[offset],
        previousFrame.data[offset + 1],
        previousFrame.data[offset + 2],
      );
      const current = rgbToHsv(
        currentFrame.data[offset],
        currentFrame.data[offset + 1],
        currentFrame.data[offset + 2],
      );
      const deltaHue = Math.abs(previous.hue - current.hue);
      const deltaSaturation = Math.abs(
        previous.saturation - current.saturation,
      );
      const deltaLuminance = Math.abs(
        previous.luminance - current.luminance,
      );
      hueDifference += deltaHue;
      saturationDifference += deltaSaturation;
      luminanceDifference += deltaLuminance;
      if (
        (deltaHue + deltaSaturation + deltaLuminance) / 3 >=
        threshold
      ) {
        changedPixels += 1;
      }
      samples += 1;
    }
  }

  if (samples === 0) {
    return { detected: false, score: 0, changedRatio: 0 };
  }
  const score =
    (hueDifference + saturationDifference + luminanceDifference) /
    (samples * 3);
  const changedRatio = changedPixels / samples;

  return {
    detected:
      score >= threshold && changedRatio >= minimumChangedRatio,
    score,
    changedRatio: clamp(changedRatio, 0, 1),
  };
}
