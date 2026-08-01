export const FINALIZATION_PROGRESS_THRESHOLD = 1;

export function createFinalizationSignal(
  onFinalizing,
  threshold = FINALIZATION_PROGRESS_THRESHOLD,
) {
  let finalizingStarted = false;

  return (progress) => {
    if (
      finalizingStarted ||
      !Number.isFinite(progress) ||
      progress < threshold
    ) {
      return false;
    }

    finalizingStarted = true;
    onFinalizing?.();
    return true;
  };
}
