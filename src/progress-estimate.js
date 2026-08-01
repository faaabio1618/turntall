export function estimateRemainingSeconds(
  progress,
  elapsedSeconds,
) {
  if (
    !Number.isFinite(progress) ||
    !Number.isFinite(elapsedSeconds) ||
    progress <= 0 ||
    progress > 1 ||
    elapsedSeconds < 0
  ) {
    return undefined;
  }

  return elapsedSeconds * (1 - progress) / progress;
}

export class ProgressTimeEstimator {
  constructor({
    minElapsedSeconds = 2,
    minProgress = 0.005,
    minSampleIntervalSeconds = 0.5,
    windowSeconds = 12,
  } = {}) {
    this.minElapsedSeconds = minElapsedSeconds;
    this.minProgress = minProgress;
    this.minSampleIntervalSeconds = minSampleIntervalSeconds;
    this.windowSeconds = windowSeconds;
    this.reset();
  }

  reset() {
    this.highWaterProgress = 0;
    this.samples = [{ progress: 0, elapsedSeconds: 0 }];
    this.remainingSeconds = undefined;
    this.lastEstimateElapsedSeconds = undefined;
  }

  update(progress, elapsedSeconds) {
    if (
      !Number.isFinite(progress) ||
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds < 0
    ) {
      return this.snapshot();
    }

    const normalizedProgress = Math.min(
      1,
      Math.max(0, progress),
    );
    if (normalizedProgress <= this.highWaterProgress) {
      return this.snapshot();
    }

    this.highWaterProgress = normalizedProgress;
    if (normalizedProgress >= 1) {
      this.remainingSeconds = 0;
      return this.snapshot();
    }

    const lastSample = this.samples.at(-1);
    if (
      elapsedSeconds - lastSample.elapsedSeconds <
      this.minSampleIntervalSeconds
    ) {
      return this.snapshot();
    }

    this.samples.push({
      progress: normalizedProgress,
      elapsedSeconds,
    });
    const cutoff = elapsedSeconds - this.windowSeconds;
    while (
      this.samples.length > 2 &&
      this.samples[1].elapsedSeconds < cutoff
    ) {
      this.samples.shift();
    }

    if (
      elapsedSeconds < this.minElapsedSeconds ||
      normalizedProgress < this.minProgress
    ) {
      return this.snapshot();
    }

    const oldestSample = this.samples[0];
    const sampleDuration =
      elapsedSeconds - oldestSample.elapsedSeconds;
    const progressDelta =
      normalizedProgress - oldestSample.progress;
    if (sampleDuration <= 0 || progressDelta <= 0) {
      return this.snapshot();
    }

    const candidate =
      (1 - normalizedProgress) /
      (progressDelta / sampleDuration);
    if (!Number.isFinite(candidate) || candidate < 0) {
      return this.snapshot();
    }

    if (this.remainingSeconds === undefined) {
      this.remainingSeconds = candidate;
    } else {
      const timeSinceEstimate =
        elapsedSeconds -
        this.lastEstimateElapsedSeconds;
      const countedDownEstimate = Math.max(
        0,
        this.remainingSeconds - timeSinceEstimate,
      );
      const smoothing =
        candidate > countedDownEstimate ? 0.12 : 0.35;
      this.remainingSeconds =
        countedDownEstimate +
        (candidate - countedDownEstimate) * smoothing;
    }
    this.lastEstimateElapsedSeconds = elapsedSeconds;
    return this.snapshot();
  }

  snapshot() {
    return {
      progress: this.highWaterProgress,
      remainingSeconds: this.remainingSeconds,
    };
  }
}

export function progressFromProcessingLog(message, durationSeconds) {
  if (
    typeof message !== "string" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return undefined;
  }

  const match = message.match(
    /\btime=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/,
  );
  if (!match) {
    return undefined;
  }

  const processedSeconds =
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]);
  if (!Number.isFinite(processedSeconds)) {
    return undefined;
  }

  return Math.min(1, Math.max(0, processedSeconds / durationSeconds));
}

export function formatEstimatedTime(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return "";
  }

  const seconds = Math.ceil(totalSeconds);
  if (seconds < 60) {
    return `${seconds} sec`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes} min ${String(remainingSeconds).padStart(
      2,
      "0",
    )} sec`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hr ${String(remainingMinutes).padStart(
    2,
    "0",
  )} min`;
}
