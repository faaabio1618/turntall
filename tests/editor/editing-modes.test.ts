import { describe, expect, it } from "vitest";
import { editingModeState } from "../../src/editor/editing-modes.ts";

describe("editing mode availability", () => {
  it("uses fast cutting while the switch is on", () => {
    expect(
      editingModeState({
        isRunning: false,
        vertical: false,
        canReencode: true,
        snapping: true,
      }),
    ).toEqual({
      exactCut: false,
      snapDisabled: false,
    });
  });

  it("uses exact cutting while the switch is off", () => {
    expect(
      editingModeState({
        isRunning: false,
        vertical: false,
        canReencode: true,
        snapping: false,
      }).exactCut,
    ).toBe(true);
  });

  it("forces exact cutting and locks the switch in vertical mode", () => {
    expect(
      editingModeState({
        isRunning: false,
        vertical: true,
        canReencode: true,
        snapping: false,
      }),
    ).toEqual({
      exactCut: true,
      snapDisabled: true,
    });
  });
});
