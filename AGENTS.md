# turntall.com agent guide

This file describes the repository for coding agents. It applies to the entire
project unless a more specific `AGENTS.md` is added in a subdirectory.

## Project overview

turntall.com is a local-first browser video editor. A user can:

- load a video without uploading or sharing it;
- choose exact start and end times;
- preview and export the selected segment;
- create a centered 9:16 vertical video;
- draw a subject box and track that subject through the clip;
- correct tracking with additional subject positions and scene jumps;
- keep or remove audio;
- change output speed from 0.5x to 3x;
- name and download the finished file.

All video analysis and conversion happens in the browser. Do not introduce a
server upload path unless the user explicitly changes this product requirement.

The application currently targets Google Chrome. Unsupported browsers see a
blocking dialog, and mobile browsers see a recommendation to use a desktop.

## Technology

- Svelte 5 for the page and editor-stage components.
- Vite 8 for development and production builds.
- TypeScript ES modules with a shared `tsconfig.json`; Svelte scripts use
  `lang="ts"`.
- Vitest with V8 coverage for pure logic.
- FFmpeg WebAssembly for compatible in-memory operations and stream-copy cuts.
- Mediabunny and native WebCodecs for streaming analysis and browser-native
  decoding, encoding, muxing, and moving crops.
- Lucide for interface icons.

Use the versions in `package.json` and `package-lock.json` as the source of
truth. Do not replace the package lock with a different package manager.

## Commands

Run commands from the repository root:

```sh
npm install
npm run dev
npm test
npm run test:watch
npm run test:coverage
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:production
npm run typecheck
npm run check:svelte
npm run build
npm run check
```

`npm run check` is the normal completion gate. It runs all unit tests,
TypeScript diagnostics, Svelte diagnostics, and the production build.

Node.js 24 is preferred through `.nvmrc`; Node.js 22.12 or newer is supported.

## Architecture

### Application shell

- `index.html` contains metadata and the `#app` mount point.
- `src/app/main.ts` is intentionally small and mounts `src/app/App.svelte`.
- `src/app/App.svelte` composes the page and imports
  `src/editor/controller.ts` from `onMount`, after all required DOM elements
  exist.
- `src/app/style.css` contains global application styling.
- `src/components/layout/` contains the header and SEO footer.
- `src/components/dialogs/` contains application dialogs.
- `src/components/editor/` contains the editor composition and its panel
  components under `panels/`.

### Editor controller

`src/editor/controller.ts` is the browser-facing editor controller. It owns
the current file, media metadata, object URLs, subject references, tracking
session, preview state, conversion state, progress state, and event listeners.

The Svelte components currently provide stable markup while
`editor/controller.ts` updates the mounted DOM directly. This is an
intentional migration boundary. Do not let Svelte reactivity and the controller
simultaneously own the same DOM property. If migrating more state into Svelte,
move one coherent feature at a time and remove the matching imperative writes
and listeners.

`src/editor/ui.ts` collects required elements and throws when a selector is
missing. Element IDs, classes used by JavaScript, dialog values, form control
values, and key `hidden` attributes are therefore application APIs, not
incidental markup. When changing a component, search
`src/editor/controller.ts`, `src/editor/ui.ts`, and the CSS before renaming or
removing anything.

### Framework-independent logic

Keep media and geometry logic independent of Svelte and the DOM whenever
possible. The framework-independent modules are grouped by domain:

- `src/platform/`: browser capability checks.
- `src/media/`: probing, formats, streaming analysis, frame scheduling, and
  shared video helpers.
- `src/tracking/`: subject geometry, template and optical-flow tracking, scene
  changes, and crop trajectories.
- `src/processing/`: FFmpeg arguments, WebCodecs conversion, progress, and
  processing-step state.
- `src/editor/`: editing modes, history, selection summaries, output-preview
  calculations, UI bindings, and the browser controller.

Add or update focused Vitest coverage when changing these modules.

Unit tests mirror the source domains under `tests/editor/`, `tests/media/`,
`tests/tracking/`, `tests/processing/`, and `tests/platform/`. Keep new pure
logic tests in the matching domain. Browser fixtures remain in
`tests/fixtures/`, and complete Playwright workflows remain in `e2e/`.

## Media processing rules

- Files at or below 1 GiB use the in-memory FFmpeg path when appropriate.
- Files above 1 GiB must use the streaming path. The threshold is exported as
  `MAX_WASM_INPUT_BYTES` in `src/media/streaming-media.ts`.
- Never read a multi-gigabyte input into one ArrayBuffer. FFmpeg Wasm has a
  32-bit address space and the virtual filesystem can create additional
  copies.
- Keep the streaming and in-memory strategies behaviorally aligned.
- Exact cuts, vertical crops, speed changes, and other transformations require
  re-encoding. A compatible fast cut may copy streams without quality loss.
- The fast-cut control is intentionally hidden in the UI, but its logic is
  retained. Do not delete that code without explicit approval.
- Vite serves `ffmpeg-core.js` and `ffmpeg-core.wasm` from `/ffmpeg/` and copies
  them into production output. Preserve the COOP/COEP and cross-origin resource
  headers in `vite.config.ts`.
- Processing is cancellable. A change must preserve cancellation for both
  FFmpeg and WebCodecs conversions.
- Processing progress has prepare, process, and finalize steps. Do not report
  completion before muxing/finalization finishes.

## Resource lifecycle and privacy

- Video files must remain local to the browser.
- Revoke old preview and download object URLs when replacing a file, resetting
  output, or leaving the page.
- Terminate obsolete FFmpeg instances and cancel active WebCodecs conversions.
- Remove temporary FFmpeg virtual-filesystem inputs and outputs when they are
  no longer needed.
- Loading another video must release the previous video's browser resources.
- After browser-based manual tests, reload the page so test videos and output
  blobs are released from memory.
- Do not print video contents, inspect personal media beyond what a test
  requires, or send local fixtures to external services.

## Important behavior invariants

Preserve these unless the user explicitly asks for different behavior:

### Loading and preview

- While metadata and keyframes are loading, an overlay blocks confusing video
  interaction.
- The first preview frame should be visible rather than a black frame.
- Output preview shows a loading state when startup is delayed.
- Output preview uses the source file and must not create an intermediate file.
- Frame stepping moves one real frame using the detected frame rate.

### Subject selection and tracking

- A click is not a subject selection. The user must drag a valid rectangle.
- A drag that begins while video is playing must stop playback.
- Clicking the video after saving a subject position must not start playback.
- Scene-change or lost-tracking correction shows red dotted boxes and asks the
  user to select the subject again.
- Tracking can resume after a correction.
- If the user moves backward behind tracked frames, ask whether to redraw the
  subject or continue with the existing tracking.
- Moving or redrawing a box compares horizontal distance with the immediately
  previous box, not merely the previous saved frame. A horizontal displacement
  of roughly 10% of the video width automatically selects `New position` and
  briefly animates that choice.
- Saving a new position must preserve both the box and the correct source frame
  used by the preview.
- Manual subject positions use Chrome's presented-frame `mediaTime`, not only
  the requested media playhead time. A `New position` must switch both the box
  and crop on that exact frame. FFmpeg must evaluate the crop before resetting
  presentation timestamps.
- The 9:16 option becomes required and cannot be deselected while subject
  references exist.
- Clearing all subject positions requires confirmation. Cancelling the dialog
  must leave every reference intact.
- Tracking speed `1x` is for fast-moving subjects; `6x` is for mostly steady
  subjects. Videos above 50 fps automatically recommend `6x`.
- Automatic crop motion follows the original Python tracker: horizontally
  smooth tracked samples with a Gaussian sigma of 5, apply a 15-source-pixel
  movement deadband (scaled slightly for high-resolution video), limit
  automatic crop travel to roughly 35% of the source width per second, then
  interpolate between committed positions. New tracking data or a new manual
  anchor may revise earlier automatic crop positions so the motion can begin
  gradually. Keep subject boxes untouched and preserve manual positions and
  scene jumps exactly.
- Spacebar activates the current primary orange tracking/selection action.

### Audio and speed

- Output speed ranges from 0.5x through 3x.
- Any speed other than 1x produces muted output and disables Keep audio.
- Returning to 1x restores the user's previous Keep audio choice.
- If the user had manually disabled Keep audio, returning to 1x must keep it
  disabled.
- Videos without an audio track show the appropriate explanation and cannot
  enable Keep audio.

### Output

- Default output names derive from the source name and chosen transformation.
- Editing the filename updates the download attribute.
- Leaving the filename blank and moving focus away restores the default name.
- A successful result must expose a blob download only after processing and
  finalization complete.

### Design and content

- The product name is `turntall.com`.
- Orange is the primary color; avoid reintroducing blue as the main action
  color.
- Prefer concise labels and Lucide icons over verbose UI copy.
- Preserve the mobile warning, SEO section, privacy language, and
  `mailto:info@turntall.com` footer link.
- The page should fill the viewport without an unnecessary white outer card.

## Testing expectations

For a logic-only change:

1. Add or update the closest unit test.
2. Run that focused test while iterating.
3. Run `npm run check` before completion.

For Svelte markup, CSS, media lifecycle, or editor-controller changes:

1. Run `npm run check`.
2. Run `npm run test:e2e` for the automated Chrome workflows.
3. Load the app in Chrome at the Vite development URL for any behavior not
   covered by Playwright.
4. Confirm the initial page has no console errors.
5. Upload a small local video and wait for the preparation overlay to clear.
6. Verify metadata, segment controls, preview controls, and the Cut button.
7. Exercise the changed workflow using real pointer/keyboard interactions.
8. For export changes, create a short two-second output and confirm the blob
   link, filename, and completed processing steps.
9. Reload the page after testing to release media resources.

`tests/fixtures/e2e-sample.webm` is the small deterministic fixture committed
for Playwright. Other optional local fixtures may exist in a developer checkout
but are ignored by Git and are not guaranteed in other clones. `test.webm` has
been used as a small no-audio fixture; `x.mp4` has been used for audio and 60
fps testing. Never commit additional `.mp4` or `.webm` fixtures unless the
repository policy is explicitly changed.

## Git and repository hygiene

- The primary branch is `main`.
- Preserve unrelated user changes in a dirty worktree.
- Do not commit `node_modules/`, `dist/`, `coverage/`, IDE settings, local Codex
  configuration, logs, or video fixtures; these are covered by `.gitignore`.
- Keep `package-lock.json` synchronized with `package.json`.
- Avoid generated build output in commits.
- Prefer small commits that separate behavior changes from structural cleanup.

## Known migration direction

The Svelte component port is complete for the page structure, but much of the
runtime UI state still lives in the imperative `src/editor/controller.ts`.
Good future refactors include extracting coherent controllers or Svelte state
for:

- source-file preparation and cleanup;
- output preview playback;
- subject selection and tracking;
- processing progress and cancellation.

Do not attempt a broad rewrite of all four areas at once. Preserve the tested
pure modules, migrate one ownership boundary at a time, and keep the application
usable after every step.
