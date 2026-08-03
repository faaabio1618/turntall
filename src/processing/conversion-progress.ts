export const FINALIZATION_PROGRESS_THRESHOLD = 1;

export function createFinalizationSignal(
  onFinalizing: () => void,
  threshold = FINALIZATION_PROGRESS_THRESHOLD,
) {
  let finalizingStarted = false;

  return (progress: number) => {
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
