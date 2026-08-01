# GifTiger code review

Reviewed: 2026-08-01

## Scope and method

This review covers the current Svelte shell, imperative editor controller,
FFmpeg/WebCodecs media paths, subject tracking, resource lifecycle, and test
configuration. It is a static review supported by the existing automated
tests and small local benchmarks; it does not claim that every codec/browser
combination was exercised.

Validation performed:

- `npm run test:coverage`: 192 tests passed with 96.62% statement coverage.
- The current Playwright suites: 9 editor tests and 1 production-bundle test
  passed in Chrome.
- A synthetic 30-minute tracking path with 3,001 references generated a
  184,656-character FFmpeg crop filter.
- Rebuilding that trajectory 300 times took about 0.79 ms per rebuild on the
  review machine, before layout reads, canvas drawing, or video decoding.

## Findings summary

| Priority | Finding | Status | Confidence |
| --- | --- | --- | --- |
| High | Cancelling an FFmpeg export can unlock the editor before the old export settles | Resolved | High |
| High | The 1 GiB in-memory cutoff leaves too little headroom for FFmpeg Wasm | Open | High |
| Medium | Large-file OPFS outputs can remain after reload or tab close | Open | High |
| Medium | Large-file preparation cannot cancel its WebCodecs capability probe | Open | High |
| Medium | Long tracking paths create very large filters and repeat trajectory work per frame | Open | High |
| Medium | The audio fallback depends on private Mediabunny internals | Open | High |
| Medium | Coverage and E2E gates omit several high-risk production paths | Resolved | High |
| Low | The editor has no component teardown/remount lifecycle | Open | High |

## Detailed findings

### 1. Resolved — FFmpeg cancellation could create overlapping operations

Resolution (2026-08-01):

- The Cancel handler now terminates FFmpeg without unlocking the editor early.
- The owning async operation retains the lock until its `catch` and `finally`
  finish.
- Playwright now cancels a real FFmpeg transformation and immediately completes
  a second export as a regression test.

Original evidence:

- `src/editor.js:3206` resets the shared `cancelRequested` flag when a new cut
  starts.
- `src/editor.js:3394` uses that shared flag to decide whether an older cut was
  cancelled or failed.
- `src/editor.js:3418` always unlocks the UI in the older cut's `finally` block.
- The former Cancel handler terminated FFmpeg and immediately called
  `setBusy(false)` when Cancel was clicked.

Previously, the FFmpeg cancellation handler unlocked the editor before the
rejected `engine.exec()` promise had necessarily reached `cutVideo()`'s
`catch` and `finally`. A user could start another cut or select another file
during that window. The new operation would set `cancelRequested` back to
`false`; the old operation could then report a failure instead of cancellation
and its `finally` could call `setBusy(false)` while the new operation was still
running.

Impact before the fix:

- Controls may become enabled during an active export or preparation.
- A stale operation may overwrite the current status or progress state.
- Two operations can contend for shared controller state.

Implemented resolution:

- Do not unlock the FFmpeg path in the click handler; terminate the worker and
  let the owning operation unlock itself after it settles.

Regression test:

- Start a deliberately slow FFmpeg export, cancel it, immediately start a new
  export, and assert that the second operation stays locked and owns all status
  updates until completion.

### 2. High — The 1 GiB Wasm cutoff is likely to cause avoidable OOM failures

Evidence:

- `src/streaming-media.js:5` routes files up to and including 1 GiB through the
  in-memory strategy.
- `src/editor.js:2877-2879` first materializes the complete file with
  `arrayBuffer()` and then writes it into FFmpeg's virtual filesystem.

A near-1 GiB input therefore needs roughly one GiB for the browser-side buffer
and another large allocation inside the FFmpeg worker/virtual filesystem.
Re-encoding also needs decoder frames, encoder buffers, the Wasm heap, and an
output file. This leaves little or no safe headroom within a 32-bit Wasm memory
space and on lower-memory desktop machines.

Impact:

- Files substantially below the advertised streaming boundary may crash the
  worker, fail with an unhelpful processing error, or make the tab unresponsive.
- The failure depends on codec, output size, browser, and machine memory, so it
  will be difficult to reproduce consistently.

Recommendation:

- Use a substantially more conservative in-memory threshold, or estimate peak
  memory from input size plus the selected operation.
- Prefer streaming for re-encoding earlier than for stream-copy operations.
- Add a recoverable fallback: if in-memory preparation fails from allocation,
  retry with the streaming/WebCodecs path when supported.

Regression test:

- Add routing tests around the revised limit and a browser test using a sparse
  or generated medium-large source that confirms memory-path failure falls
  back cleanly.

### 3. Medium — Large-file OPFS outputs can persist after the page closes

Evidence:

- `src/webcodecs-editor.js:165-189` writes disk-backed outputs to the browser's
  origin-private file system as `giftiger-output-*.mp4`.
- `src/editor.js:3313` stores the returned cleanup callback.
- `src/editor.js:2468-2479` runs it only when output is reset.
- `src/editor.js:3829-3838` revokes object URLs on `beforeunload`, but does not
  remove the OPFS file.

If a user successfully processes a large video and then reloads or closes the
tab without starting another cut/file, the temporary output can remain in
persistent browser storage. This is both a disk-usage and local-privacy issue.

Recommendation:

- Remove the OPFS entry as soon as a stable `File` snapshot has been obtained,
  if browser behavior permits it.
- Otherwise keep a small registry of temporary names and clean stale GifTiger
  outputs on application startup as well as on normal reset.
- Do not rely only on asynchronous work inside `beforeunload`, because browsers
  do not guarantee its completion.

Regression test:

- Mock the storage directory and verify cleanup after success/reset, failure,
  cancellation, and a simulated next application startup.

### 4. Medium — Cancel does not interrupt the large-file capability probe

Evidence:

- `src/editor.js:2938-2949` passes cancellation into streaming packet analysis.
- `src/editor.js:2969` then awaits `canEditWithWebCodecs()` without passing any
  abort signal or revision callback.
- `src/editor.js:3811-3812` returns early from the Cancel handler when no FFmpeg
  instance exists, leaving the editor locked until the probe finishes.

Cancellation is checked while keyframes are scanned, but not while the browser
conversion capability is initialized. On a very large or unusual file, the UI
can therefore continue showing preparation after the user presses Cancel.

Recommendation:

- Thread an `AbortSignal` or `isCancelled` callback through
  `canEditWithWebCodecs()` and `createConversion()`.
- Re-check both cancellation and `sourceRevision` immediately after every
  awaited capability probe before mutating `mediaInfo` or the UI.

Regression test:

- Delay the capability probe, cancel preparation, resolve the probe, and assert
  that no stale metadata is committed and the UI returns to an idle state.

### 5. Medium — Tracking work grows poorly with clip length

Evidence:

- `src/editor.js:181` stores an automatic reference approximately every 0.6
  seconds.
- `src/crop-trajectory.js:217-251` emits nested FFmpeg `if(...)` expressions
  for every trajectory point, for both horizontal and vertical positions.
- `src/editor.js:410-461` rebuilds and sorts the full trajectory while drawing
  the live crop overlay.
- `src/output-preview.js:35-65` also rebuilds it for every output-preview frame.

At the current reference interval, a 30-minute fully tracked clip has about
3,001 references. In the local benchmark this generated a 184,656-character
FFmpeg filter. The same reference list is repeatedly filtered, mapped, sorted,
and smoothed during playback. The measured 0.79 ms trajectory rebuild excludes
layout reads and frame drawing, so the total main-thread cost can be material
at 30–60 fps.

Impact:

- Preview movement can become less smooth as tracked duration grows.
- Very large nested FFmpeg expressions may parse slowly or fail for long clips.

Recommendation:

- Cache the normalized trajectory and invalidate it only when references,
  selection bounds, or dimensions change.
- Cache preview geometry until a resize instead of reading layout every frame.
- Downsample near-collinear automatic points within a bounded visual error
  before generating the FFmpeg expression.
- Add an explicit maximum/filter-size fallback for long paths.

Regression test:

- Benchmark preview calculation and filter generation at 100, 1,000, and 5,000
  references, with an upper bound for filter size and frame-time work.

### 6. Medium — Audio packet copying relies on private library fields

Evidence:

- `src/webcodecs-editor.js:136-160` accesses `conversion._trackPromises`,
  `conversion._started`, and `conversion._canceled` directly.

The leading-underscore members are implementation details rather than a stable
Mediabunny API. The exact Mediabunny version is currently pinned, which reduces
immediate risk, but a routine upgrade can silently break audio completion or
cancellation semantics.

Recommendation:

- Replace this integration with a supported custom-track or packet-copy API.
- If no public API exists, isolate the compatibility adapter, assert the
  expected internal shape at runtime, and add a full trimmed-audio integration
  test before changing the dependency version.

### 7. Resolved — Automated gates omitted critical media paths

Resolution (2026-08-01):

- `vitest.config.js` now counts all framework-independent modules instead of a
  hand-picked subset.
- Streaming analysis is covered at 100% of lines and WebCodecs conversion at
  97.58%, including disposal, packet-copied audio, failure, cancellation,
  disk-backed OPFS output, and cleanup.
- Playwright now performs real automatic tracking, speed-adjusted MP4 export,
  vertical MP4 export, FFmpeg cancellation/restart, and output metadata checks.
- A separate production smoke suite runs the built bundle through `vite
  preview`, verifies cross-origin isolation, and checks both local FFmpeg
  assets.
- CI runs both editor and production Playwright suites and uploads their
  reports.

Residual opportunities, not considered blockers for this finding, are a real
H.264/AAC fixture, a multi-position moving-crop export, and a browser-level
streaming test. The large-file and OPFS implementations are covered with
deterministic mocks so CI does not require a multi-gigabyte fixture.

### 8. Low — The editor cannot be safely destroyed and remounted

Evidence:

- `src/App.svelte:8-10` dynamically imports the controller in `onMount()` but
  returns no cleanup function.
- `src/editor.js:3422-3826` installs many element/window listeners and two
  `ResizeObserver` instances without retaining teardown handles.
- ES modules are cached, so importing `editor.js` after a remount will not
  execute its initialization again.

The current application mounts once, so this does not normally affect users.
It does make hot replacement and any future client-side navigation/remount
fragile: old DOM nodes can remain referenced, observers can leak, and new nodes
will not receive controller listeners.

Recommendation:

- Export an explicit `initializeEditor()` function that returns `dispose()`.
- Call it from `onMount()` and return the disposer from the Svelte lifecycle.
- Have disposal remove listeners, disconnect observers, cancel conversions,
  terminate FFmpeg, and revoke object URLs.

## Suggested order of work

1. Fix the FFmpeg cancel/restart race and add its regression test.
2. Reduce or redesign the in-memory cutoff before relying on large-file support.
3. Close the OPFS lifecycle and large-file cancellation gaps together.
4. Cache/simplify tracking trajectories before optimizing lower-level tracker
   math.
5. Expand automated coverage, then encapsulate the Mediabunny compatibility
   code and editor lifecycle.

## Positive observations

- Media stays local; no upload or network-processing path was found.
- Object URLs are normally revoked when replacing media or output.
- FFmpeg virtual files are generally deleted or released with worker
  termination.
- Pure geometry/media helpers have strong unit coverage and clear boundaries.
- The new E2E suite provides a useful baseline for core visible workflows and
  rejects browser console errors.
