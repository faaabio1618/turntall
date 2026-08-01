export interface SubjectEditState {
  subjectReferences?: Array<{ box?: Record<string, unknown>; [key: string]: any }>;
  trackingConfidencePoints?: Array<Record<string, unknown>>;
  [key: string]: any;
}

interface SubjectEditEntry {
  state: SubjectEditState;
  label: string;
}

function cloneBox(box?: Record<string, unknown>) {
  return box ? { ...box } : box;
}

export function cloneSubjectEditState(state: SubjectEditState) {
  return {
    ...state,
    subjectReferences: (state.subjectReferences ?? []).map(
      (reference) => ({
        ...reference,
        box: cloneBox(reference.box),
      }),
    ),
    trackingConfidencePoints: (
      state.trackingConfidencePoints ?? []
    ).map((point) => ({ ...point })),
  };
}

export class SubjectEditHistory {
  limit: number;
  past: SubjectEditEntry[];
  future: SubjectEditEntry[];

  constructor(limit = 50) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  record(state: SubjectEditState, label: string) {
    this.past.push({
      state: cloneSubjectEditState(state),
      label,
    });
    if (this.past.length > this.limit) {
      this.past.shift();
    }
    this.future = [];
  }

  undo(currentState: SubjectEditState) {
    const entry = this.past.pop();
    if (!entry) {
      return undefined;
    }
    this.future.push({
      state: cloneSubjectEditState(currentState),
      label: entry.label,
    });
    return {
      state: cloneSubjectEditState(entry.state),
      label: entry.label,
    };
  }

  redo(currentState: SubjectEditState) {
    const entry = this.future.pop();
    if (!entry) {
      return undefined;
    }
    this.past.push({
      state: cloneSubjectEditState(currentState),
      label: entry.label,
    });
    return {
      state: cloneSubjectEditState(entry.state),
      label: entry.label,
    };
  }
}
