function cloneBox(box) {
  return box ? { ...box } : box;
}

export function cloneSubjectEditState(state) {
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

  record(state, label) {
    this.past.push({
      state: cloneSubjectEditState(state),
      label,
    });
    if (this.past.length > this.limit) {
      this.past.shift();
    }
    this.future = [];
  }

  undo(currentState) {
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

  redo(currentState) {
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
