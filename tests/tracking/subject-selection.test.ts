import { describe, expect, it } from "vitest";
import {
  alignTimeToSubjectFrame,
  boxFromPoints,
  containedMediaRect,
  isDistantSubjectPosition,
  isValidSubjectBox,
  isSceneJumpSuggestion,
  moveBox,
  normalizedPoint,
  replaceSubjectReference,
  resizeBox,
  subjectBoxAtTime,
  subjectReferenceAtTime,
  subjectReferencesAfter,
  subjectReferencesNeedingDecision,
  subjectTimeBounds,
  trackingRestartRequiresDecision,
} from "../../src/tracking/subject-selection.ts";

describe("subject selection geometry", () => {
  it("locates letterboxed video content inside its element", () => {
    expect(containedMediaRect(800, 600, 1920, 1080)).toEqual({
      left: 0,
      top: 75,
      width: 800,
      height: 450,
    });
  });

  it("normalizes and clamps a pointer to the video frame", () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };

    expect(normalizedPoint(300, 100, rect)).toEqual({
      x: 0.5,
      y: 0.25,
    });
    expect(normalizedPoint(20, 500, rect)).toEqual({ x: 0, y: 1 });
  });

  it("draws a box in either pointer direction", () => {
    expect(
      boxFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 }),
    ).toEqual({
      x: 0.2,
      y: 0.1,
      width: 0.6000000000000001,
      height: 0.6,
    });
  });

  it("moves a box without allowing it outside the frame", () => {
    expect(
      moveBox({ x: 0.2, y: 0.3, width: 0.4, height: 0.5 }, 0.7, -0.5),
    ).toEqual({
      x: 0.6,
      y: 0,
      width: 0.4,
      height: 0.5,
    });
  });

  it("resizes from a corner while preserving a minimum size", () => {
    const box = resizeBox(
      { x: 0.2, y: 0.2, width: 0.4, height: 0.5 },
      "nw",
      0.5,
      0.6,
      0.1,
    );

    expect(box.x).toBeCloseTo(0.5);
    expect(box.y).toBeCloseTo(0.6);
    expect(box.width).toBeCloseTo(0.1);
    expect(box.height).toBeCloseTo(0.1);
    expect(isValidSubjectBox(box, 0.1)).toBe(true);
  });

  it("validates complete normalized subject boxes", () => {
    expect(
      isValidSubjectBox({ x: 0.1, y: 0.1, width: 0.4, height: 0.7 }),
    ).toBe(true);
    expect(
      isValidSubjectBox({ x: 0.9, y: 0.1, width: 0.2, height: 0.7 }),
    ).toBe(false);
    expect(
      isValidSubjectBox({ x: 0.1, y: 0.1, width: 0.01, height: 0.7 }),
    ).toBe(false);
  });
});

describe("subject frame timestamps", () => {
  const references = [
    { time: 4.994 },
    { time: 5.04 },
  ];

  it("restores the saved timestamp represented by a rounded time", () => {
    expect(alignTimeToSubjectFrame(references, 4.99, 30)).toBe(
      4.994,
    );
    expect(alignTimeToSubjectFrame(references, 5.03, 30)).toBe(5.04);
  });

  it("leaves times without a saved frame unchanged", () => {
    expect(alignTimeToSubjectFrame(references, 4.9, 30)).toBe(4.9);
    expect(alignTimeToSubjectFrame(references, 4.99, undefined)).toBe(
      4.99,
    );
  });
});

describe("subject frame time bounds", () => {
  it("uses the earliest and latest selected subject frames", () => {
    expect(
      subjectTimeBounds([
        { time: 12 },
        { time: 3 },
        { time: 8 },
      ]),
    ).toEqual({ start: 3, end: 12 });
  });

  it("sets only the start until a second frame is selected", () => {
    expect(subjectTimeBounds([{ time: 4.5 }])).toEqual({
      start: 4.5,
      end: undefined,
    });
    expect(subjectTimeBounds([])).toBeUndefined();
  });

  it("ignores references without valid timestamps", () => {
    expect(
      subjectTimeBounds([
        { time: Number.NaN },
        { time: 2 },
        { time: undefined },
      ]),
    ).toEqual({ start: 2, end: undefined });
  });
});

describe("replacing an earlier subject frame", () => {
  const references = [
    { id: 1, time: 2, box: { x: 0.1 } },
    { id: 2, time: 5, box: { x: 0.2 } },
    { id: 3, time: 8, box: { x: 0.3 } },
  ];

  it("finds every later box except the frame being edited", () => {
    expect(subjectReferencesAfter(references, 5, 2)).toEqual([
      references[2],
    ]);
    expect(subjectReferencesAfter(references, 8, 3)).toEqual([]);
  });

  it("orders boxes by frame when timestamps differ inside one frame", () => {
    const sameFrame = { id: 1, time: 4.994 };
    const laterFrame = { id: 2, time: 5.04 };
    expect(
      subjectReferencesAfter(
        [sameFrame, laterFrame],
        5,
        undefined,
        0.005,
        30,
      ),
    ).toEqual([laterFrame]);
  });

  it("can replace a frame and keep later boxes", () => {
    const replacement = { id: 2, time: 5, box: { x: 0.7 } };

    expect(
      replaceSubjectReference(references, replacement, false),
    ).toEqual([references[0], replacement, references[2]]);
  });

  it("can replace a frame and delete every later box", () => {
    const replacement = { id: 2, time: 5, box: { x: 0.7 } };

    expect(
      replaceSubjectReference(references, replacement, true),
    ).toEqual([references[0], replacement]);
  });

  it("keeps timestamp jitter from creating two identities for one frame", () => {
    const sameFrame = { id: 2, time: 4.994, box: { x: 0.2 } };
    const laterFrame = { id: 3, time: 5.04, box: { x: 0.3 } };
    const replacement = { id: 2, time: 5, box: { x: 0.7 } };

    expect(
      replaceSubjectReference(
        [sameFrame, laterFrame],
        replacement,
        true,
        0.005,
        30,
      ),
    ).toEqual([replacement]);
  });
});

describe("matching the selected subject frame", () => {
  const terminalReference = {
    id: 3,
    time: 3,
    automatic: true,
    box: { x: 0.3 },
  };

  it("matches the decoded final frame to its terminal tracking box", () => {
    expect(
      subjectReferenceAtTime(
        [
          { id: 1, time: 0, box: { x: 0.1 } },
          {
            id: 2,
            time: 2.9667,
            automatic: true,
            box: { x: 0.2 },
          },
          terminalReference,
        ],
        2.9667,
        { duration: 3.008, frameRate: 30 },
      ),
    ).toBe(terminalReference);
  });

  it("does not treat an earlier frame as the terminal tracking box", () => {
    expect(
      subjectReferenceAtTime([terminalReference], 2.9, {
        duration: 3,
        frameRate: 30,
      }),
    ).toBeUndefined();
  });

  it("does not call the terminal automatic marker a later box", () => {
    expect(
      subjectReferencesNeedingDecision(
        [
          { id: 1, time: 0, automatic: false },
          { id: 2, time: 2.9667, automatic: true },
          terminalReference,
        ],
        2.9667,
        2,
        30,
      ),
    ).toEqual([]);
  });

  it("keeps a genuinely later terminal marker in the decision", () => {
    expect(
      subjectReferencesNeedingDecision(
        [{ id: 1, time: 2.9 }, terminalReference],
        2.9,
        1,
        30,
      ),
    ).toEqual([terminalReference]);
  });
});

describe("restarting automatic tracking", () => {
  const references = [
    { time: 2, automatic: false },
    { time: 5, automatic: true },
    { time: 8, automatic: true },
  ];

  it("asks before restarting behind an automatically tracked frame", () => {
    expect(trackingRestartRequiresDecision(references, 4, 30)).toBe(true);
  });

  it("continues normally at the latest tracked frame", () => {
    expect(trackingRestartRequiresDecision(references, 8, 30)).toBe(false);
    expect(
      trackingRestartRequiresDecision(
        [{ time: 8, automatic: false }],
        4,
        30,
      ),
    ).toBe(false);
  });

  it("does not treat timestamp jitter within the stopped frame as moving backward", () => {
    expect(
      trackingRestartRequiresDecision(
        [{ time: 5, automatic: true }],
        4.994,
        30,
      ),
    ).toBe(false);
  });

  it("resumes directly from the frame where Stop completed", () => {
    expect(
      trackingRestartRequiresDecision(
        references,
        4,
        30,
        0.005,
        4,
      ),
    ).toBe(false);
    expect(
      trackingRestartRequiresDecision(
        references,
        4,
        30,
        0.005,
        4.1,
      ),
    ).toBe(true);
  });
});

describe("scene-change jump suggestion", () => {
  it("matches the selected frame near the detected scene change", () => {
    expect(isSceneJumpSuggestion(4.2, 4.25)).toBe(true);
    expect(isSceneJumpSuggestion(4.2, 4.5)).toBe(false);
  });

  it("rejects missing timestamps", () => {
    expect(isSceneJumpSuggestion(undefined, 4.2)).toBe(false);
    expect(isSceneJumpSuggestion(4.2, Number.NaN)).toBe(false);
  });
});

describe("distant subject position suggestion", () => {
  const previous = { x: 0.1, y: 0.2, width: 0.2, height: 0.3 };

  it("suggests a new position after 10% horizontal movement", () => {
    expect(
      isDistantSubjectPosition(previous, {
        x: 0.21,
        y: 0.2,
        width: 0.2,
        height: 0.3,
      }),
    ).toBe(true);
  });

  it("ignores nearby, vertical-only, and missing boxes", () => {
    expect(
      isDistantSubjectPosition(previous, {
        x: 0.16,
        y: 0.23,
        width: 0.2,
        height: 0.3,
      }),
    ).toBe(false);
    expect(
      isDistantSubjectPosition(previous, {
        x: 0.1,
        y: 0.45,
        width: 0.2,
        height: 0.3,
      }),
    ).toBe(false);
    expect(isDistantSubjectPosition(previous, undefined)).toBe(false);
  });
});

describe("saved subject box display", () => {
  const references = [
    {
      time: 2,
      box: { x: 0.1, y: 0.2, width: 0.2, height: 0.4 },
    },
    {
      time: 6,
      box: { x: 0.5, y: 0.4, width: 0.3, height: 0.2 },
    },
  ];

  it("interpolates the visible box between saved frames", () => {
    expect(subjectBoxAtTime(references, 4)).toEqual({
      x: 0.30000000000000004,
      y: 0.30000000000000004,
      width: 0.25,
      height: 0.30000000000000004,
    });
  });

  it("hides the box before the first saved frame", () => {
    expect(subjectBoxAtTime(references, 0)).toBeUndefined();
    expect(subjectBoxAtTime(references, 2)).toEqual(references[0].box);
  });

  it("hides the box after the last saved frame", () => {
    expect(subjectBoxAtTime(references, 10)).toBeUndefined();
    expect(subjectBoxAtTime(references, 6)).toEqual(references[1].box);
    expect(subjectBoxAtTime([], 3)).toBeUndefined();
  });

  it("holds the previous box until a new-position frame", () => {
    expect(
      subjectBoxAtTime(
        [
          references[0],
          { ...references[1], jump: true },
        ],
        5.9,
      ),
    ).toEqual(references[0].box);
  });

  it("changes the box on the exact new-position frame", () => {
    expect(
      subjectBoxAtTime(
        [
          references[0],
          { ...references[1], jump: true },
        ],
        5.996,
      ),
    ).toEqual(references[0].box);
    expect(
      subjectBoxAtTime(
        [
          references[0],
          { ...references[1], jump: true },
        ],
        6,
      ),
    ).toEqual(references[1].box);
  });
});
