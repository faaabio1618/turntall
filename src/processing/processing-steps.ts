const STEP_IDS = ["prepare", "process", "finalize"] as const;
type ProcessingStepId = (typeof STEP_IDS)[number];
type ProcessingStepState = "waiting" | "active" | "done" | "cancelled" | "failed";

interface ProcessingStep {
  id: ProcessingStepId;
  label: string;
  state: ProcessingStepState;
  startedAt?: number;
  durationSeconds?: number;
}

export class ProcessingStepTracker {
  steps: ProcessingStep[];
  activeStepId?: ProcessingStepId;

  constructor(processLabel = "Cut the selected clip") {
    this.steps = [
      this.createStep("prepare", "Load the source video"),
      this.createStep("process", processLabel),
      this.createStep(
        "finalize",
        "Finish the video and prepare the download",
      ),
    ];
    this.activeStepId = undefined;
  }

  createStep(id: ProcessingStepId, label: string): ProcessingStep {
    return {
      id,
      label,
      state: "waiting",
      startedAt: undefined,
      durationSeconds: undefined,
    };
  }

  start(stepId: ProcessingStepId, now: number) {
    if (!STEP_IDS.includes(stepId) || !Number.isFinite(now)) {
      return;
    }

    if (this.activeStepId) {
      this.complete(this.activeStepId, now);
    }

    const step = this.steps.find(({ id }) => id === stepId);
    if (!step || step.state === "done") {
      return;
    }

    step.state = "active";
    step.startedAt = now;
    step.durationSeconds = undefined;
    this.activeStepId = stepId;
  }

  complete(stepId: ProcessingStepId, now: number) {
    const step = this.steps.find(({ id }) => id === stepId);
    if (
      !step ||
      step.state !== "active" ||
      !Number.isFinite(now)
    ) {
      return;
    }

    step.state = "done";
    step.durationSeconds = Math.max(
      0,
      (now - step.startedAt) / 1000,
    );
    if (this.activeStepId === stepId) {
      this.activeStepId = undefined;
    }
  }

  stop(state: "cancelled" | "failed", now: number) {
    if (!["cancelled", "failed"].includes(state)) {
      return;
    }

    const step = this.steps.find(
      ({ id }) => id === this.activeStepId,
    );
    if (!step || !Number.isFinite(now)) {
      return;
    }

    step.state = state;
    step.durationSeconds = Math.max(
      0,
      (now - step.startedAt) / 1000,
    );
    this.activeStepId = undefined;
  }

  snapshot(now: number) {
    return this.steps.map((step) => ({
      ...step,
      elapsedSeconds:
        step.state === "active" && Number.isFinite(now)
          ? Math.max(0, (now - step.startedAt) / 1000)
          : undefined,
    }));
  }
}

export function formatStepDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "";
  }

  if (seconds < 10) {
    if (seconds < 0.05) {
      return "<0.1 sec";
    }
    return `${seconds.toFixed(1)} sec`;
  }

  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) {
    return `${roundedSeconds} sec`;
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const remainder = roundedSeconds % 60;
  return `${minutes} min ${String(remainder).padStart(2, "0")} sec`;
}
