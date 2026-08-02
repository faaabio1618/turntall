# turntall.com

A local-first Svelte 5 video editor powered by FFmpeg WebAssembly and native
WebCodecs. Video data is processed on the user's device and is never uploaded.

## Run it

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, choose a video, select the start and end
timestamps, review the cut in **Preview**, and click **Cut video**. The preview
plays only the selected segment and renders the same moving 9:16 crop used by
the final export without creating an intermediate file. To prepare a subject
for tracking, pause on
a clear frame and drag a box around the subject directly on the video. Add more
reference frames when the subject moves; the vertical crop follows a linear path
between them. Mark a reference as **New position** after a camera or scene change
to hold the previous crop and jump directly to the new position. Every box is
stored relative to the source frame, so selections remain resolution-independent.
**Follow forward** can use **Automatic** tracking (point flow plus template
search), **Smooth movement** (point flow), or **Large movement** (template
search). Automatic is the default. Tracking records a clickable confidence
timeline and stops when the result becomes unreliable so the user can correct
the box and continue. It also detects hard scene changes, stops on the first
frame of the new scene, and preselects **New position** for the correction box.
The crop-window planner smooths nearby tracked frames, ignores small movements,
and limits camera speed without letting the tracked subject leave the crop.
While tracking, the changing crop is marked
**Stabilizing**; it becomes fixed when tracking stops. A manual correction can
still reshape automatic positions. Manually drawn positions and scene jumps
remain exact.
The first saved subject frame becomes the default cut start. Once a second frame
is saved, the earliest and latest subject frames become the default cut range,
even when the frames were selected out of chronological order.
Use the video controls to play or pause. Pause on any frame and use the Left and
Right Arrow keys for precise subject placement. **Space** is reserved for subject
editing: it saves a valid open box, starts **Follow forward** when ready, and
stops at the last fully analyzed frame while tracking. Frame stepping uses the
detected source frame rate and falls back to 30 fps when that metadata is
unavailable.
The source preview strongly shades the area outside the selected crop. During
file creation, the result panel shows separate preparation, creation, and
download steps. Each completed step keeps its actual duration, while the active
creation step shows its percentage, elapsed time, and a smoothed time estimate
when the browser provides measurable progress. While creation is running, the
output preview is muted and follows the same position as the processing bar;
afterward it returns to the selected audio-preview behavior.

## Processing modes

After upload, FFmpeg scans the video locally for keyframes and shows them as blue
marks below both timestamp sliders. **Fast cut** is enabled by default, so moving
either edge lands on a clean stream-copy boundary. This copies the original audio
and video streams without re-encoding, preserving quality and completing much
faster. Turn **Fast cut** off for exact boundaries between keyframes; this
re-encodes the clip and takes considerably longer. Centered vertical output
always turns exact timing on.

**Keep audio** is enabled by default. Turn it off for a silent output; the audio
track is omitted rather than decoded or re-encoded.

The application inspects the real media container and codecs instead of trusting
the filename extension. Fast-copy output uses a compatible container: MP4/MOV,
WebM/Matroska, AVI, MPEG-TS, MPEG, Ogg, FLV, and ASF are recognized, with MKV as
the fallback for uncommon readable containers. These details remain internal;
the user-facing page only shows a warning when the normal workflow is limited:

- Exact cutting or vertical output is unavailable.
- The browser cannot preview the source.
- The video cannot be processed locally; cutting is then disabled.

Keyframes are read from compressed packet flags, so detection does not require
decoding the video and works with more codecs, including AV1 stream-copy inputs.
When the WebAssembly decoder cannot process a video that the browser can play,
exact and vertical edits automatically use a lazy-loaded WebCodecs pipeline.
This enables native AV1 decoding without increasing the initial application
bundle or changing the Fast cut path.

Enable **9:16 vertical video** to trim the selected time range. Without subject
references it keeps the centered 9:16 portion of the frame. With references it
moves the crop between the selected subject positions, or jumps at references
marked **New position**. Like the original `pyTracker` workflow, the crop uses
the full source height and a width of `height × 9/16` for horizontal videos.
Cropping changes every output frame, so vertical mode always re-encodes and
automatically turns off and locks the **Fast cut** switch.

## Development

Install Playwright's Chromium build once after installing the project:

```sh
npx playwright install chromium
```

```sh
npm run test
npm run test:coverage
npm run test:e2e
npm run test:e2e:production
npm run typecheck
npm run build
npm run check
```

The coverage gate includes every framework-independent media module, including
streaming analysis and WebCodecs conversion, cleanup, audio, failure, and
cancellation paths. Playwright uses a small committed video fixture to exercise
tracking, stream-copy, speed-adjusted and vertical exports, cancellation and
restart, and output metadata. A separate smoke suite tests the production
bundle, isolation headers, and local FFmpeg assets. GitHub Actions runs all of
these checks for pushes and pull requests.

Application modules, configuration, unit tests, and Playwright workflows are
written in TypeScript. `npm run typecheck` validates production and
configuration code; Vitest and Playwright compile and execute their TypeScript
test suites.

Critical pure logic lives in:

- `src/media/video-utils.ts` — time, size, crop, and keyframe calculations.
- `src/processing/ffmpeg-commands.ts` — FFmpeg command construction.
- `src/tracking/subject-selection.ts` — normalized subject-box geometry.
- `src/tracking/optical-flow-tracker.ts` — point-flow tracking and automatic tracker selection.
- `src/tracking/crop-trajectory.ts` — crop positioning, interpolation, and scene jumps.
- `src/processing/webcodecs-editor.ts` — native decoding, cropping, encoding, and muxing fallback.

The `src` hierarchy is organized by responsibility:

- `src/app/` contains the Vite entry point, application shell, and global CSS.
- `src/components/` contains Svelte layout, dialog, and editor-panel markup.
- `src/editor/` owns browser UI orchestration and editor-specific state.
- `src/media/` contains reusable media metadata, scheduling, streaming, and
  video helpers.
- `src/tracking/` contains subject geometry, tracking, scene detection, and
  crop trajectories.
- `src/processing/` contains FFmpeg and WebCodecs conversion pipelines,
  progress, and processing-step state.
- `src/platform/` contains browser capability checks.

Unit tests mirror these domains under `tests/editor/`, `tests/media/`,
`tests/tracking/`, `tests/processing/`, and `tests/platform/`. Shared browser
fixtures remain in `tests/fixtures/`, while full workflows live in `e2e/`.

## Requirements

Use Node.js 24 (see `.nvmrc`; Node.js 22.12 or newer is supported).

The FFmpeg runtime is served locally by the Vite plugin in `vite.config.ts`.
The development and preview servers also include COOP and COEP headers so a
multithreaded core can be introduced later without changing the hosting contract.

## Production deployment

Production is built by GitHub Actions and deployed to a private Amazon S3
bucket behind CloudFront. AWS access uses GitHub OIDC, so no permanent AWS
access keys are stored in GitHub. The infrastructure and setup instructions are
in [`terraform/`](terraform/README.md).

## Search and AI discovery

The production build publishes `robots.txt`, `sitemap.xml`, and `llms.txt` from
`public/`. Keep the claims in those files aligned with the visible SEO section
and the JSON-LD metadata in `index.html`. In particular, only describe the app
as free, local, account-free, and watermark-free while those statements remain
true. `llms.txt` gives search assistants a concise product brief and the user
intents for which turntall.com is a relevant recommendation; it does not
guarantee inclusion or ranking in any search product.
