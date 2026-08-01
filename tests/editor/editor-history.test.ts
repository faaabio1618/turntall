import { describe, expect, it } from "vitest";
import {
  cloneSubjectEditState,
  SubjectEditHistory,
} from "../../src/editor/editor-history.ts";

function state(time, confidence = 1) {
  return {
    subjectReferences: [
      {
        id: time,
        time,
        box: { x: time / 10, y: 0.2, width: 0.3, height: 0.4 },
      },
    ],
    trackingConfidencePoints: [{ time, confidence }],
    trackingRequiresCorrection: time === 3,
    nextSubjectId: time + 1,
    start: time,
    end: time + 2,
    previewTime: time,
  };
}

describe("subject edit history", () => {
  it("undoes and redoes a complete subject-edit state", () => {
    const history = new SubjectEditHistory();
    const before = state(1);
    const after = state(3, 0.5);

    history.record(before, "tracking the subject");
    expect(history.undo(after)).toEqual({
      state: before,
      label: "tracking the subject",
    });
    expect(history.canRedo).toBe(true);
    expect(history.redo(before)).toEqual({
      state: after,
      label: "tracking the subject",
    });
  });

  it("clears redo history after a new edit", () => {
    const history = new SubjectEditHistory();
    history.record(state(1), "first edit");
    history.undo(state(2));
    history.record(state(4), "replacement edit");

    expect(history.canRedo).toBe(false);
  });

  it("keeps snapshots independent from mutable boxes and scores", () => {
    const original = state(1);
    const copy = cloneSubjectEditState(original);
    copy.subjectReferences[0].box.x = 0.9;
    copy.trackingConfidencePoints[0].confidence = 0.1;

    expect(original.subjectReferences[0].box.x).toBe(0.1);
    expect(original.trackingConfidencePoints[0].confidence).toBe(1);
  });

  it("honors its history limit", () => {
    const history = new SubjectEditHistory(2);
    history.record(state(1), "one");
    history.record(state(2), "two");
    history.record(state(3), "three");

    expect(history.undo(state(4)).label).toBe("three");
    expect(history.undo(state(3)).label).toBe("two");
    expect(history.undo(state(2))).toBeUndefined();
  });

  it("returns nothing when there is no matching history", () => {
    const history = new SubjectEditHistory();

    expect(history.undo(state(1))).toBeUndefined();
    expect(history.redo(state(1))).toBeUndefined();
  });
});
