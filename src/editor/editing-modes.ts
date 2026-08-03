export function editingModeState({
  isRunning,
  vertical,
  canReencode,
  snapping,
}: {
  isRunning: boolean;
  vertical: boolean;
  canReencode: boolean;
  snapping: boolean;
}) {
  return {
    exactCut: vertical || !snapping,
    snapDisabled: isRunning || vertical || !canReencode,
  };
}
