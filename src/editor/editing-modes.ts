export function editingModeState({
  isRunning,
  vertical,
  canReencode,
  snapping,
}) {
  return {
    exactCut: vertical || !snapping,
    snapDisabled: isRunning || vertical || !canReencode,
  };
}
