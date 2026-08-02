import { FFmpeg } from "@ffmpeg/ffmpeg";
import classWorkerURL from "@ffmpeg/ffmpeg/worker?worker&url";
import {
  createCutArgs,
  createDecodeProbeArgs,
  createKeyframeScanArgs,
} from "../processing/ffmpeg-commands.ts";
import {
  CROP_STABILIZATION_WINDOW_SECONDS,
  createCropTrajectory,
  cropRectangleAtTime,
  stabilizeTrackedReferences,
} from "../tracking/crop-trajectory.ts";
import {
  decoderSupport,
  ffmpegReencodeCommand,
  mediaCompatibilityWarning,
  parseDecoderList,
  parseMediaProbeLogs,
  processingFailureMessage,
  selectStreamCopyContainer,
} from "../media/media-format.ts";
import {
  fitPreviewCanvas,
  outputPreviewCanDraw,
  outputPreviewFrame,
  processingPreviewTime,
} from "./output-preview.ts";
import {
  formatEstimatedTime,
  progressFromProcessingLog,
  ProgressTimeEstimator,
} from "../processing/progress-estimate.ts";
import {
  formatStepDuration,
  ProcessingStepTracker,
} from "../processing/processing-steps.ts";
import { editingModeState } from "./editing-modes.ts";
import { SubjectEditHistory } from "./editor-history.ts";
import {
  MIN_SUBJECT_BOX_SIZE,
  alignTimeToSubjectFrame,
  boxFromPoints,
  containedMediaRect,
  isDistantSubjectPosition,
  isSceneJumpSuggestion,
  isValidSubjectBox,
  moveBox,
  normalizedPoint,
  resizeBox,
  replaceSubjectReference,
  subjectBoxAtTime,
  subjectReferenceAtTime,
  subjectReferencesNeedingDecision,
  subjectTimeBounds,
  trackingRestartRequiresDecision,
} from "../tracking/subject-selection.ts";
import {
  createTrackingTemplate,
  nearestTrackingConfidencePoint,
  trackTemplate,
  trackingConfidenceHue,
  trackingFrameInterval,
  trackingWaitMilliseconds,
  updateTrackingTemplate,
} from "../tracking/template-tracker.ts";
import {
  selectTrackingResult,
  trackOpticalFlow,
} from "../tracking/optical-flow-tracker.ts";
import { sceneChangeScore } from "../tracking/scene-change.ts";
import {
  analyzeStreamingMedia,
  MEDIA_LOADING_STRATEGY,
  mediaLoadingStrategy,
  requiresStreamingInput,
} from "../media/streaming-media.ts";
import {
  centeredVerticalSize,
  clamp,
  defaultOutputFilename,
  frameIndexAtTime,
  frameNumberAtTime,
  frameStepTime,
  formatBytes,
  formatTime,
  nearestKeyframe,
  parseFramecrcKeyframes,
  presentedFrameTime,
  sameDisplayedTime,
  sameVideoFrame,
  spaceShortcutAction,
  suggestedTrackingFrameSkip,
} from "../media/video-utils.ts";
import { MediaFrameScheduler } from "../media/media-frame-scheduler.ts";
import { describeSelection } from "./selection-summary.ts";
import {
  collectUiElements,
  initializeUi,
  setIconOnlyControl,
  setLabeledControl,
} from "./ui.ts";
const elements = collectUiElements();
initializeUi(elements);

const ffmpegCoreBaseURL = new URL(
  `${import.meta.env.BASE_URL}ffmpeg/`,
  window.location.origin,
);
const coreURL = new URL("ffmpeg-core.js", ffmpegCoreBaseURL).href;
const wasmURL = new URL("ffmpeg-core.wasm", ffmpegCoreBaseURL).href;
const cropPreviewFrames = new MediaFrameScheduler(elements.preview);
const outputPreviewFrames = new MediaFrameScheduler(
  elements.outputPreviewMedia,
);
const outputPreviewStillFrames = new MediaFrameScheduler(
  elements.outputPreviewMedia,
);

let selectedFile;
let previewURL;
let downloadURL;
let downloadCleanup;
let duration = 0;
let sourceWidth = 0;
let sourceHeight = 0;
let ffmpeg;
let activeLogSink;
let activeWebConversion;
let isUsingWebCodecs = false;
let webCodecsEditorPromise;
let decoderNames;
let mediaInfo;
let browserPreviewReadable;
let previewMetadataReady = false;
let keyframePreparationComplete = false;
let keyframes = [];
let sourceRevision = 0;
let pendingReplacementFile;
let subjectOnboardingRevision = -1;
let preparedInputName;
let preparedRevision = -1;
let trackingSpeedRecommendationApplied = false;
let preferredKeepAudio = true;
let isRunning = false;
let cancelRequested = false;
let isSelectingSubject = false;
let subjectReferences = [];
let editingSubjectId;
let nextSubjectId = 1;
let draftSubjectBox;
let previousSubjectBoxBeforeDraw;
let subjectJumpAutoSelectedByDistance = false;
let subjectSelectionTime = 0;
let subjectInteraction;
let previewControlsBeforeSubject = true;
let previewSubjectGesture;
let suppressPreviewClick = false;
let pendingSubjectSave;
let isTrackingSubject = false;
let stopTrackingRequested = false;
let pendingFrameStepAfterTracking = 0;
let trackingLastGoodTime;
let trackingRequestedStopTime;
let trackingStoppedFrameTime;
let trackingLiveBox;
let trackingSessionAnchorTime;
let trackingRequiresCorrection = false;
let trackingConfidencePoints = [];
let trackingConfidenceDisplayRange;
let trackingStatusFollowsPreviewFrame = false;
let suggestedSubjectJumpTime;
let trackingCanvas;
let previewControlsBeforeTracking = true;
let previewMutedBeforeTracking = false;
let previewPresentedTime;
let outputPreviewReady = false;
let outputPreviewFinished = false;
let outputPreviewStarting = false;
let outputPreviewPendingSeek;
let outputPreviewDraggingPointer;
let outputPreviewFramePresented = false;
let outputPreviewPresentedTime;
let processingEstimateStartedAt;
let processingTimeEstimator;
let processingEstimateTimer;
let lastProcessingProgressAt;
let processingStepTracker;
let activeProcessingStepId;
let processingStepAction;
let processingSegmentDuration;
let lastProcessingPreviewUpdateAt = 0;
let reencodeCopyStatusTimer;
const subjectEditHistory = new SubjectEditHistory();

const MAX_VISIBLE_KEYFRAME_MARKS = 240;
const SUBJECT_DRAG_THRESHOLD = 7;
const VIDEO_CONTROLS_GUARD_HEIGHT = 52;
const TRACKING_MAX_FRAME_WIDTH = 360;
const TRACKING_CONFIDENCE_THRESHOLD = 0.38;
const TRACKING_LOW_CONFIDENCE_SECONDS = 0.4;
const TRACKING_METHOD = "automatic";
const PROCESSING_PROGRESS_SILENCE_SECONDS = 8;
const PROCESSING_LAST_FRAMES_THRESHOLD = 0.995;
const PROCESSING_PREVIEW_INTERVAL_MS = 1000;
const PROCESSING_PREVIEW_NOTE =
  "Silent live preview following the creation progress.";
const PREVIEW_NOTE_WITH_AUDIO =
  "This preview uses the original video and does not create a file.";
const PREVIEW_NOTE_WITHOUT_AUDIO =
  "Audio is removed from this preview and the final video.";

function loadWebCodecsEditor() {
  webCodecsEditorPromise ??= import("../processing/webcodecs-editor.ts");
  return webCodecsEditorPromise;
}

function selection() {
  const start = Number(elements.startTime.value);
  const end = Number(elements.endTime.value);
  return {
    start: alignTimeToSubjectFrame(
      subjectReferences,
      start,
      mediaInfo?.frameRate,
    ),
    end: alignTimeToSubjectFrame(
      subjectReferences,
      end,
      mediaInfo?.frameRate,
    ),
  };
}

function selectedVideoSpeed() {
  return clamp(Number(elements.videoSpeed.value), 0.5, 3);
}

function sourcePreviewTime() {
  return presentedFrameTime(
    elements.preview.currentTime,
    previewPresentedTime,
    mediaInfo?.frameRate,
  );
}

function outputPreviewSourceTime() {
  return presentedFrameTime(
    elements.outputPreviewMedia.currentTime,
    outputPreviewPresentedTime,
    mediaInfo?.frameRate,
  );
}

function updateVideoSpeed() {
  const speed = selectedVideoSpeed();
  elements.videoSpeed.value = String(speed);
  const muted = speed !== 1;
  if (muted) {
    elements.keepAudio.checked = false;
  } else {
    elements.keepAudio.checked = preferredKeepAudio;
  }
  elements.videoSpeedValue.textContent = `${Number(speed.toFixed(2))}×${
    muted ? " · Muted" : ""
  }`;
  elements.outputPreviewMedia.playbackRate = speed;
  elements.outputPreviewMedia.preservesPitch = true;
  updateMode();
  refreshOutputPreview();
}

function editorLocked() {
  return isRunning || isSelectingSubject || isTrackingSubject;
}

function setVideoPreparationState(preparing, message = "") {
  if (preparing) {
    elements.preview.pause();
  }
  elements.videoPreparationOverlay.hidden = !preparing;
  elements.previewStage.setAttribute("aria-busy", String(preparing));
  elements.preview.controls = !preparing;
  elements.preview.tabIndex = preparing ? -1 : 0;
  if (message) {
    elements.videoPreparationMessage.textContent = message;
  }
}

function updateVideoPreparationMessage(revision, message) {
  if (
    revision === sourceRevision &&
    !elements.videoPreparationOverlay.hidden
  ) {
    elements.videoPreparationMessage.textContent = message;
  }
}

function finishVideoPreparation(revision) {
  if (
    revision === sourceRevision &&
    previewMetadataReady &&
    keyframePreparationComplete
  ) {
    setVideoPreparationState(false);
    showSubjectOnboarding(revision);
  }
}

function dismissSubjectOnboarding() {
  elements.subjectOnboarding.classList.remove("active");
}

function showSubjectOnboarding(revision) {
  if (
    revision !== sourceRevision ||
    revision === subjectOnboardingRevision ||
    browserPreviewReadable !== true ||
    mediaInfo?.canReencode === false
  ) {
    return;
  }

  subjectOnboardingRevision = revision;
  elements.subjectOnboarding.classList.remove("active");
  void elements.subjectOnboarding.offsetWidth;
  elements.subjectOnboarding.classList.add("active");
}

function subjectEditState() {
  const { start, end } = selection();
  return {
    subjectReferences,
    trackingConfidencePoints,
    trackingRequiresCorrection,
    suggestedSubjectJumpTime,
    nextSubjectId,
    start,
    end,
    previewTime: Number.isFinite(sourcePreviewTime())
      ? sourcePreviewTime()
      : start,
  };
}

function recordSubjectEdit(label) {
  subjectEditHistory.record(subjectEditState(), label);
}

function restoreSubjectEdit(entry, direction) {
  if (!entry) {
    return;
  }
  if (isSelectingSubject) {
    setSubjectSelectionMode(false);
  }

  pendingSubjectSave = undefined;
  subjectReferences = entry.state.subjectReferences;
  trackingConfidencePoints =
    entry.state.trackingConfidencePoints;
  trackingRequiresCorrection =
    entry.state.trackingRequiresCorrection ?? false;
  suggestedSubjectJumpTime = entry.state.suggestedSubjectJumpTime;
  trackingConfidenceDisplayRange = undefined;
  nextSubjectId = entry.state.nextSubjectId;
  setTime("start", entry.state.start);
  setTime("end", entry.state.end);
  if (
    browserPreviewReadable === true &&
    Number.isFinite(entry.state.previewTime)
  ) {
    elements.preview.pause();
    elements.preview.currentTime = clamp(
      entry.state.previewTime,
      0,
      duration,
    );
  }

  renderTrackingConfidenceTimeline();
  updateSubjectSummary();
  updateMode();
  setTrackingStatus(
    `${direction === "undo" ? "Undid" : "Redid"} ${
      entry.label
    }.`,
  );
}

function undoSubjectEdit() {
  if (isRunning || isTrackingSubject) {
    return;
  }
  if (isSelectingSubject) {
    cancelSubjectSelection();
    setTrackingStatus("Cancelled the unsaved subject box.");
    return;
  }
  restoreSubjectEdit(
    subjectEditHistory.undo(subjectEditState()),
    "undo",
  );
}

function redoSubjectEdit() {
  if (editorLocked()) {
    return;
  }
  restoreSubjectEdit(
    subjectEditHistory.redo(subjectEditState()),
    "redo",
  );
}

function updateSubjectSurfaceRect() {
  if (!sourceWidth || !sourceHeight || elements.previewStage.hidden) {
    renderCropPreview();
    renderSavedSubjectBox();
    return;
  }

  const stageRect = elements.previewStage.getBoundingClientRect();
  const previewRect = elements.preview.getBoundingClientRect();
  const contentRect = containedMediaRect(
    previewRect.width,
    previewRect.height,
    sourceWidth,
    sourceHeight,
  );

  for (const surface of [
    elements.subjectSurface,
    elements.subjectOnboarding,
  ]) {
    surface.style.left = `${
      previewRect.left - stageRect.left + contentRect.left
    }px`;
    surface.style.top = `${
      previewRect.top - stageRect.top + contentRect.top
    }px`;
    surface.style.width = `${contentRect.width}px`;
    surface.style.height = `${contentRect.height}px`;
  }
  renderCropPreview();
  renderSavedSubjectBox();
}

function previewFrameNumber(time = sourcePreviewTime()) {
  return frameNumberAtTime(time, mediaInfo?.frameRate);
}

function subjectFrameLabel(time) {
  const frameNumber = previewFrameNumber(time);
  return frameNumber === undefined
    ? formatTime(time)
    : `frame ${frameNumber}`;
}

function sameSubjectFrame(first, second) {
  const frameRate = mediaInfo?.frameRate;
  return Number.isFinite(frameRate) && frameRate > 0
    ? sameVideoFrame(first, second, frameRate)
    : sameDisplayedTime(first, second);
}

function renderPreviewFrameIndicator() {
  const previewTime = sourcePreviewTime();
  const frame = previewFrameNumber(previewTime);
  elements.previewFrameIndicator.hidden =
    frame === undefined || elements.previewStage.hidden;
  if (frame !== undefined) {
    elements.previewFrameIndicator.value = `Frame ${frame}`;
    elements.previewFrameIndicator.textContent = `Frame ${frame}`;
  }
  if (trackingStatusFollowsPreviewFrame) {
    renderViewingSubjectFrameStatus(previewTime);
  }
}

function renderOutputPreviewFrameIndicator() {
  const frame = previewFrameNumber(
    outputPreviewSourceTime(),
  );
  elements.outputPreviewFrameIndicator.hidden =
    frame === undefined || elements.outputPreviewCanvas.hidden;
  if (frame !== undefined) {
    elements.outputPreviewFrameIndicator.value = `Frame ${frame}`;
    elements.outputPreviewFrameIndicator.textContent = `Frame ${frame}`;
  }
}

function renderCropPreview() {
  const previewTime = sourcePreviewTime();
  const hasSubjectAtPreviewTime = Boolean(
    (isTrackingSubject && trackingLiveBox) ||
      subjectBoxAtTime(subjectReferences, previewTime),
  );
  const visible =
    subjectReferences.length > 0 &&
    hasSubjectAtPreviewTime &&
    !isSelectingSubject &&
    sourceWidth > 0 &&
    sourceHeight > 0 &&
    duration > 0 &&
    !elements.previewStage.hidden;
  const provisional = isTrackingSubject && Boolean(trackingLiveBox);
  elements.cropPreview.classList.toggle("provisional", provisional);
  elements.cropPreviewLabel.textContent = provisional
    ? "Stabilizing"
    : "Crop";
  elements.cropPreview.hidden = !visible;

  if (!visible) {
    return;
  }

  const stageRect = elements.previewStage.getBoundingClientRect();
  const previewRect = elements.preview.getBoundingClientRect();
  const contentRect = containedMediaRect(
    previewRect.width,
    previewRect.height,
    sourceWidth,
    sourceHeight,
  );
  const cropSize = centeredVerticalSize(sourceWidth, sourceHeight);
  const previewReferences = trackingLiveBox
    ? stabilizeTrackedReferences(
        [
          ...subjectReferences,
          {
            id: "tracking-live",
            time: previewTime,
            box: trackingLiveBox,
            jump: false,
            automatic: true,
          },
        ].sort((left, right) => left.time - right.time),
        {
          sourceWidth,
          sourceHeight,
          cropSize,
          fixedBeforeTime: Math.max(
            Number.isFinite(trackingSessionAnchorTime)
              ? trackingSessionAnchorTime
              : Number.NEGATIVE_INFINITY,
            previewTime - CROP_STABILIZATION_WINDOW_SECONDS,
          ),
        },
      )
    : subjectReferences;
  const trajectory = createCropTrajectory(previewReferences, {
    start: 0,
    end: duration,
    sourceWidth,
    sourceHeight,
    cropSize,
  });
  const crop = cropRectangleAtTime(
    trajectory,
    previewTime,
    cropSize,
  );

  elements.cropPreview.style.left = `${
    previewRect.left -
    stageRect.left +
    contentRect.left +
    (crop.left / sourceWidth) * contentRect.width
  }px`;
  elements.cropPreview.style.top = `${
    previewRect.top -
    stageRect.top +
    contentRect.top +
    (crop.top / sourceHeight) * contentRect.height
  }px`;
  elements.cropPreview.style.width = `${
    (crop.width / sourceWidth) * contentRect.width
  }px`;
  elements.cropPreview.style.height = `${
    (crop.height / sourceHeight) * contentRect.height
  }px`;
}

function stopCropPreviewAnimation() {
  cropPreviewFrames.cancel();
}

function scheduleCropPreviewFrame(force = false) {
  if (
    cropPreviewFrames.pending ||
    elements.preview.ended ||
    (!force && elements.preview.paused)
  ) {
    return;
  }

  const renderNextFrame = (_now, metadata) => {
    previewPresentedTime = Number.isFinite(metadata?.mediaTime)
      ? metadata.mediaTime
      : elements.preview.currentTime;
    renderCropPreview();
    renderSavedSubjectBox();
    renderPreviewFrameIndicator();
    scheduleCropPreviewFrame();
  };
  cropPreviewFrames.schedule(renderNextFrame);
}

function stopOutputPreviewFrame() {
  outputPreviewFrames.cancel();
}

function stopOutputPreviewStillFrame() {
  outputPreviewStillFrames.cancel();
}

function scheduleOutputPreviewStillFrame() {
  if (
    outputPreviewStillFrames.pending ||
    !outputPreviewReady ||
    elements.outputPreviewMedia.readyState < 2
  ) {
    return;
  }

  const drawPresentedFrame = (_now, metadata) => {
    outputPreviewPresentedTime = Number.isFinite(metadata?.mediaTime)
      ? metadata.mediaTime
      : elements.outputPreviewMedia.currentTime;
    outputPreviewFramePresented = true;
    drawOutputPreviewFrame();
  };
  outputPreviewStillFrames.schedule(drawPresentedFrame);
}

function setOutputPreviewMediaTime(time) {
  stopOutputPreviewStillFrame();
  outputPreviewFramePresented = false;
  outputPreviewPresentedTime = undefined;
  elements.outputPreviewMedia.currentTime = time;
  scheduleOutputPreviewStillFrame();
}

function outputPreviewSelectionIsValid() {
  const { start, end } = selection();
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end <= duration &&
    end > start
  );
}

function updateOutputPreviewControls() {
  const { start, end } = selection();
  const segmentDuration = Math.max(0, end - start);
  const current = clamp(
    elements.outputPreviewMedia.currentTime - start,
    0,
    segmentDuration,
  );
  const displayedCurrent = clamp(
    outputPreviewPendingSeek ?? current,
    0,
    segmentDuration,
  );

  elements.outputPreviewToggle.disabled =
    isRunning ||
    outputPreviewStarting ||
    !outputPreviewReady ||
    !outputPreviewSelectionIsValid();
  elements.outputPreviewSeek.disabled =
    elements.outputPreviewToggle.disabled;
  elements.outputPreviewSeek.max = String(segmentDuration || 1);
  elements.outputPreviewSeek.value = String(displayedCurrent);
  const previewControl = outputPreviewStarting
    ? { label: "Loading", icon: "loading" }
    : elements.outputPreviewMedia.paused
      ? outputPreviewFinished
        ? { label: "Replay preview", icon: "replay" }
        : { label: "Play preview", icon: "play" }
      : { label: "Pause preview", icon: "pause" };
  setLabeledControl(
    elements.outputPreviewToggle,
    previewControl.label,
    previewControl.icon,
  );
  elements.outputPreviewToggle.classList.toggle(
    "is-loading",
    outputPreviewStarting,
  );
  elements.outputPreviewTime.textContent = `${formatTime(
    displayedCurrent,
  )} / ${formatTime(segmentDuration)}`;
}

function drawOutputPreviewFrame() {
  if (
    !outputPreviewReady ||
    !outputPreviewCanDraw({
      readyState: elements.outputPreviewMedia.readyState,
      seeking: elements.outputPreviewMedia.seeking,
      framePresented: outputPreviewFramePresented,
    }) ||
    !outputPreviewSelectionIsValid() ||
    !sourceWidth ||
    !sourceHeight
  ) {
    updateOutputPreviewControls();
    return;
  }

  const { start, end } = selection();
  const frame = outputPreviewFrame({
    vertical: elements.verticalMode.checked,
    references: subjectReferences,
    start,
    end,
    currentTime: outputPreviewSourceTime(),
    sourceWidth,
    sourceHeight,
  });
  const canvasSize = fitPreviewCanvas(
    frame.width,
    frame.height,
  );
  if (
    elements.outputPreviewCanvas.width !== canvasSize.width ||
    elements.outputPreviewCanvas.height !== canvasSize.height
  ) {
    elements.outputPreviewCanvas.width = canvasSize.width;
    elements.outputPreviewCanvas.height = canvasSize.height;
  }

  const context = elements.outputPreviewCanvas.getContext("2d", {
    alpha: false,
  });
  context.drawImage(
    elements.outputPreviewMedia,
    frame.left,
    frame.top,
    frame.width,
    frame.height,
    0,
    0,
    canvasSize.width,
    canvasSize.height,
  );
  elements.outputPreviewStage.classList.add("canvas-ready");
  elements.outputPreviewCanvas.hidden = false;
  renderOutputPreviewFrameIndicator();
  updateOutputPreviewControls();
}

function finishOutputPreview() {
  const { end } = selection();
  outputPreviewPendingSeek = undefined;
  elements.outputPreviewMedia.pause();
  outputPreviewStarting = false;
  stopOutputPreviewFrame();
  outputPreviewFinished = true;
  if (
    Number.isFinite(end) &&
    Math.abs(elements.outputPreviewMedia.currentTime - end) > 0.005
  ) {
    setOutputPreviewMediaTime(end);
  }
  drawOutputPreviewFrame();
}

function scheduleOutputPreviewFrame() {
  if (
    outputPreviewFrames.pending ||
    elements.outputPreviewMedia.paused ||
    elements.outputPreviewMedia.ended
  ) {
    return;
  }

  const renderNextFrame = (_now, metadata) => {
    outputPreviewPresentedTime = Number.isFinite(metadata?.mediaTime)
      ? metadata.mediaTime
      : elements.outputPreviewMedia.currentTime;
    outputPreviewFramePresented = true;
    const { end } = selection();
    if (elements.outputPreviewMedia.currentTime >= end - 0.005) {
      finishOutputPreview();
      return;
    }
    drawOutputPreviewFrame();
    scheduleOutputPreviewFrame();
  };
  outputPreviewFrames.schedule(renderNextFrame);
}

function pauseOutputPreview() {
  outputPreviewStarting = false;
  elements.outputPreviewMedia.pause();
  stopOutputPreviewFrame();
  updateOutputPreviewControls();
}

function seekOutputPreview(relativeTime) {
  if (!outputPreviewReady || !outputPreviewSelectionIsValid()) {
    return;
  }

  const { start, end } = selection();
  outputPreviewPendingSeek = clamp(
    relativeTime,
    0,
    end - start,
  );
  pauseOutputPreview();
  outputPreviewFinished = false;
  setOutputPreviewMediaTime(start + outputPreviewPendingSeek);
  updateOutputPreviewControls();
}

function seekOutputPreviewFromPointer(event) {
  if (elements.outputPreviewSeek.disabled) {
    return;
  }

  const rect =
    elements.outputPreviewSeek.getBoundingClientRect();
  const { start, end } = selection();
  const progress = clamp(
    (event.clientX - rect.left) / rect.width,
    0,
    1,
  );
  seekOutputPreview((end - start) * progress);
}

function refreshOutputPreview(sourceTime = undefined) {
  pauseOutputPreview();
  outputPreviewFinished = false;
  outputPreviewPendingSeek = undefined;

  if (
    !outputPreviewReady ||
    !outputPreviewSelectionIsValid()
  ) {
    updateOutputPreviewControls();
    return;
  }

  const { start, end } = selection();
  const targetTime = Number.isFinite(sourceTime)
    ? clamp(sourceTime, start, end)
    : start;
  if (
    Math.abs(elements.outputPreviewMedia.currentTime - targetTime) >
    0.005
  ) {
    setOutputPreviewMediaTime(targetTime);
  } else if (!outputPreviewFramePresented) {
    scheduleOutputPreviewStillFrame();
  } else {
    drawOutputPreviewFrame();
  }
  updateOutputPreviewControls();
}

function syncOutputPreviewAudio() {
  elements.outputPreviewMedia.muted = !elements.keepAudio.checked;
  elements.outputPreviewNote.textContent = elements.keepAudio.checked
    ? PREVIEW_NOTE_WITH_AUDIO
    : PREVIEW_NOTE_WITHOUT_AUDIO;
}

function restoreOutputPreviewMode() {
  syncOutputPreviewAudio();
}

function syncOutputPreviewToProcessing(progress, force = false) {
  if (
    !outputPreviewReady ||
    !outputPreviewSelectionIsValid() ||
    !Number.isFinite(progress)
  ) {
    return;
  }

  const now = performance.now();
  if (
    !force &&
    now - lastProcessingPreviewUpdateAt <
      PROCESSING_PREVIEW_INTERVAL_MS
  ) {
    return;
  }

  const { start, end } = selection();
  const targetTime = processingPreviewTime({
    start,
    end,
    progress,
  });
  if (targetTime === undefined) {
    return;
  }

  lastProcessingPreviewUpdateAt = now;
  elements.outputPreviewMedia.pause();
  elements.outputPreviewMedia.muted = true;
  elements.outputPreviewNote.textContent = PROCESSING_PREVIEW_NOTE;
  if (
    Math.abs(elements.outputPreviewMedia.currentTime - targetTime) >
    0.005
  ) {
    setOutputPreviewMediaTime(targetTime);
  } else if (!outputPreviewFramePresented) {
    scheduleOutputPreviewStillFrame();
  } else {
    drawOutputPreviewFrame();
  }
  updateOutputPreviewControls();
}

function resetOutputPreviewMedia() {
  pauseOutputPreview();
  outputPreviewReady = false;
  outputPreviewFinished = false;
  outputPreviewStarting = false;
  outputPreviewPendingSeek = undefined;
  outputPreviewFramePresented = false;
  outputPreviewPresentedTime = undefined;
  stopOutputPreviewStillFrame();
  elements.outputPreviewPanel.hidden = true;
  elements.outputPreviewMedia.removeAttribute("src");
  elements.outputPreviewMedia.load();
  elements.outputPreviewCanvas.width = 1;
  elements.outputPreviewCanvas.height = 1;
  elements.outputPreviewCanvas.hidden = true;
  elements.outputPreviewStage.classList.remove("canvas-ready");
  elements.outputPreviewFrameIndicator.hidden = true;
  elements.outputPreviewNote.textContent = PREVIEW_NOTE_WITH_AUDIO;
  updateOutputPreviewControls();
}

async function toggleOutputPreview() {
  if (
    !outputPreviewReady ||
    !outputPreviewSelectionIsValid() ||
    isRunning
  ) {
    return;
  }

  if (!elements.outputPreviewMedia.paused) {
    pauseOutputPreview();
    return;
  }

  const { start, end } = selection();
  if (
    outputPreviewFinished ||
    elements.outputPreviewMedia.currentTime < start ||
    elements.outputPreviewMedia.currentTime >= end
  ) {
    setOutputPreviewMediaTime(start);
  }

  outputPreviewFinished = false;
  elements.preview.pause();
  outputPreviewStarting = true;
  updateOutputPreviewControls();
  try {
    await elements.outputPreviewMedia.play();
    outputPreviewStarting = false;
    updateOutputPreviewControls();
    scheduleOutputPreviewFrame();
  } catch {
    outputPreviewStarting = false;
    elements.outputPreviewNote.textContent =
      "The preview could not start. Try pressing Play preview again.";
    updateOutputPreviewControls();
  }
}

function renderSubjectBox() {
  elements.subjectOverlay.classList.toggle(
    "requires-reselection",
    trackingRequiresCorrection,
  );
  elements.subjectInstruction.textContent = trackingRequiresCorrection
    ? "Please select the subject again"
    : "Drag around the subject";
  const visible = isSelectingSubject && Boolean(draftSubjectBox);
  elements.subjectBox.hidden = !visible;
  elements.confirmSubject.disabled = !isValidSubjectBox(draftSubjectBox);
  const startsTracking =
    subjectReferences.length === 0 && editingSubjectId === undefined;
  setLabeledControl(
    elements.confirmSubject,
    startsTracking ? "Create vertical video" : "Save position",
    startsTracking ? "track" : "save",
  );

  if (trackingRequiresCorrection) {
    renderSavedSubjectBox();
  }

  if (!visible) {
    return;
  }

  elements.subjectBox.style.left = `${draftSubjectBox.x * 100}%`;
  elements.subjectBox.style.top = `${draftSubjectBox.y * 100}%`;
  elements.subjectBox.style.width = `${draftSubjectBox.width * 100}%`;
  elements.subjectBox.style.height = `${draftSubjectBox.height * 100}%`;
}

function renderSavedSubjectBox() {
  const visible =
    subjectReferences.length > 0 &&
    (!isSelectingSubject ||
      (trackingRequiresCorrection && !draftSubjectBox)) &&
    !isTrackingSubject &&
    sourceWidth > 0 &&
    sourceHeight > 0 &&
    !elements.previewStage.hidden;
  const box = visible
    ? subjectBoxAtTime(
        subjectReferences,
        sourcePreviewTime(),
      )
    : undefined;
  elements.savedSubjectBox.hidden = !box;
  elements.subjectOverlay.classList.toggle("saved", Boolean(box));
  elements.subjectOverlay.classList.toggle(
    "requires-reselection",
    trackingRequiresCorrection,
  );
  elements.savedSubjectLabel.textContent = trackingRequiresCorrection
    ? "Please select the subject again"
    : "";
  elements.savedSubjectLabel.hidden = !trackingRequiresCorrection;

  if (!box) {
    return;
  }

  elements.savedSubjectBox.style.left = `${box.x * 100}%`;
  elements.savedSubjectBox.style.top = `${box.y * 100}%`;
  elements.savedSubjectBox.style.width = `${box.width * 100}%`;
  elements.savedSubjectBox.style.height = `${box.height * 100}%`;
}

function renderTrackingBox() {
  const visible = isTrackingSubject && Boolean(trackingLiveBox);
  elements.trackingBox.hidden = !visible;
  elements.subjectOverlay.classList.toggle("tracking", visible);

  if (!visible) {
    return;
  }

  elements.trackingBox.style.left = `${trackingLiveBox.x * 100}%`;
  elements.trackingBox.style.top = `${trackingLiveBox.y * 100}%`;
  elements.trackingBox.style.width = `${trackingLiveBox.width * 100}%`;
  elements.trackingBox.style.height = `${trackingLiveBox.height * 100}%`;
}

function setTrackingStatus(
  message = "",
  warning = false,
  shortcut = "",
  followsPreviewFrame = false,
) {
  trackingStatusFollowsPreviewFrame = followsPreviewFrame;
  elements.trackingStatusMessage.textContent = message;
  elements.trackingStatusShortcut.textContent = shortcut;
  elements.trackingStatusShortcut.hidden = !shortcut;
  elements.trackingStatus.hidden = !message;
  elements.trackingStatus.classList.toggle("warning", warning);
}

function renderViewingSubjectFrameStatus(time) {
  if (
    subjectReferences.length === 0 ||
    !subjectBoxAtTime(subjectReferences, time)
  ) {
    setTrackingStatus("", false, "", true);
    return;
  }

  setTrackingStatus(
    `Viewing ${subjectFrameLabel(
      time,
    )}. Drag around the subject to correct it, then save the subject position.`,
    false,
    "",
    true,
  );
}

function updateTrackingControls() {
  const hasReference = subjectReferences.length > 0;
  const controlsHidden = !hasReference || isSelectingSubject;
  elements.subjectTrackingActions.hidden = controlsHidden;
  elements.followSubject.classList.toggle(
    "control-unavailable",
    isTrackingSubject,
  );
  elements.followSubject.setAttribute(
    "aria-hidden",
    String(isTrackingSubject),
  );
  elements.followSubject.disabled =
    !hasReference ||
    isRunning ||
    isSelectingSubject ||
    isTrackingSubject ||
    browserPreviewReadable !== true;
  setLabeledControl(
    elements.followSubject,
    trackingRequiresCorrection ? "Redraw" : "Track",
    trackingRequiresCorrection ? "reset" : "track",
  );
  elements.followSubject.setAttribute(
    "aria-label",
    trackingRequiresCorrection
      ? "Draw a new box (Spacebar)"
      : "Track subject (Spacebar)",
  );
  setLabeledControl(elements.stopFollowing, "Stop", "stop");
  elements.stopFollowing.classList.toggle(
    "control-unavailable",
    !isTrackingSubject,
  );
  elements.stopFollowing.setAttribute(
    "aria-hidden",
    String(!isTrackingSubject),
  );
  elements.stopFollowing.disabled =
    !isTrackingSubject || stopTrackingRequested;
  elements.trackingFrameSkip.disabled =
    isTrackingSubject || isRunning;
}

function selectedTrackingFrameSkip() {
  const frameSkip = Number(elements.trackingFrameSkip.value);
  return Number.isFinite(frameSkip) && frameSkip >= 1
    ? Math.floor(frameSkip)
    : 1;
}

function renderTrackingConfidencePlayhead() {
  const range = trackingConfidenceDisplayRange;
  if (!range) {
    elements.trackingConfidencePlayhead.hidden = true;
    return;
  }

  const time = elements.preview.currentTime;
  const visible = time >= range.start && time <= range.end;
  elements.trackingConfidencePlayhead.hidden = !visible;
  if (visible) {
    elements.trackingConfidencePlayhead.style.left = `${
      ((time - range.start) / (range.end - range.start)) * 100
    }%`;
  }
}

function renderTrackingStabilizationTail() {
  const range = trackingConfidenceDisplayRange;
  const lastTime = trackingConfidencePoints.at(-1)?.time;
  const visible =
    isTrackingSubject &&
    range &&
    Number.isFinite(lastTime) &&
    range.end > range.start;
  elements.trackingStabilizationTail.hidden = !visible;
  if (!visible) {
    return;
  }

  const stableThrough = Math.max(
    range.start,
    lastTime - CROP_STABILIZATION_WINDOW_SECONDS,
  );
  elements.trackingStabilizationTail.style.left = `${clamp(
    ((stableThrough - range.start) / (range.end - range.start)) * 100,
    0,
    100,
  )}%`;
}

function renderTrackingConfidenceTimeline() {
  const points = trackingConfidencePoints;
  const hasEstimatedPoints = points.some((point) => !point.manual);
  elements.trackingConfidence.hidden =
    !hasEstimatedPoints || points.length < 2;

  if (elements.trackingConfidence.hidden) {
    trackingConfidenceDisplayRange = undefined;
    elements.trackingConfidencePlayhead.hidden = true;
    elements.trackingStabilizationTail.hidden = true;
    return;
  }

  const start = points[0].time;
  const lastTime = points.at(-1).time;
  const frameInterval = trackingFrameInterval(
    mediaInfo?.frameRate,
    selectedTrackingFrameSkip(),
  );
  const end = Math.max(
    lastTime + frameInterval,
    start + frameInterval,
  );
  trackingConfidenceDisplayRange = { start, end };
  const canvas = elements.trackingConfidenceCanvas;
  const width = Math.max(1, Math.round(canvas.clientWidth));
  const height = Math.max(1, Math.round(canvas.clientHeight));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const segmentEnd = Math.min(
      next?.time ?? end,
      point.time + frameInterval * 1.15,
    );
    const left = ((point.time - start) / (end - start)) * width;
    const right = ((segmentEnd - start) / (end - start)) * width;
    const hue = trackingConfidenceHue(
      point.confidence,
      TRACKING_CONFIDENCE_THRESHOLD,
    );
    context.fillStyle = `hsl(${hue} 76% 42%)`;
    context.fillRect(
      Math.floor(left),
      0,
      Math.max(2, Math.ceil(right - left)),
      height,
    );
  }

  elements.trackingConfidenceStart.textContent = formatTime(start);
  elements.trackingConfidenceEnd.textContent = formatTime(lastTime);
  canvas.setAttribute("aria-valuemin", String(start));
  canvas.setAttribute("aria-valuemax", String(lastTime));
  canvas.setAttribute(
    "aria-valuenow",
    String(clamp(elements.preview.currentTime, start, lastTime)),
  );
  renderTrackingConfidencePlayhead();
  renderTrackingStabilizationTail();
}

function recordTrackingConfidence(time, confidence, manual = false) {
  if (!Number.isFinite(time) || !Number.isFinite(confidence)) {
    return;
  }

  const point = {
    time,
    confidence: clamp(confidence, 0, 1),
    manual,
  };
  trackingConfidencePoints = [
    ...trackingConfidencePoints.filter(
      (item) => Math.abs(item.time - time) >= 0.01,
    ),
    point,
  ].sort((left, right) => left.time - right.time);
  renderTrackingConfidenceTimeline();
}

function confidencePointFromClientX(clientX) {
  const range = trackingConfidenceDisplayRange;
  if (!range) {
    return undefined;
  }
  const rect =
    elements.trackingConfidenceCanvas.getBoundingClientRect();
  const progress = clamp((clientX - rect.left) / rect.width, 0, 1);
  return nearestTrackingConfidencePoint(
    trackingConfidencePoints,
    range.start + (range.end - range.start) * progress,
  );
}

function reviewTrackingConfidencePoint(point) {
  if (!point || isRunning || isTrackingSubject || isSelectingSubject) {
    return;
  }
  pauseOutputPreview();
  elements.preview.pause();
  elements.preview.currentTime = point.time;
  elements.trackingConfidenceCanvas.setAttribute(
    "aria-valuenow",
    String(point.time),
  );
  setTrackingStatus(
    `Reviewing ${subjectFrameLabel(point.time)} at ${Math.round(
      point.confidence * 100,
    )}% confidence. Drag around the subject to correct this frame.`,
    point.confidence <= TRACKING_CONFIDENCE_THRESHOLD,
  );
  elements.preview.focus({ preventScroll: true });
}

function renderSubjectReferences() {
  const fragment = document.createDocumentFragment();
  const automaticReferences = subjectReferences.filter(
    (reference) => reference.automatic,
  );
  const lastAutomaticReference = automaticReferences.at(-1);
  const visibleReferences = subjectReferences.filter(
    (reference) =>
      !reference.automatic ||
      reference.id === lastAutomaticReference?.id,
  );

  for (const reference of visibleReferences) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "subject-reference";
    button.classList.toggle("jump", reference.jump);
    button.classList.toggle("automatic", reference.automatic);
    if (reference.automatic) {
      setIconOnlyControl(button, "arrowRight");
    } else {
      button.textContent = `${reference.jump ? "New · " : ""}${subjectFrameLabel(
        reference.time,
      )}`;
    }
    if (reference.automatic) {
      button.title = `Tracked to ${subjectFrameLabel(reference.time)}`;
    }
    button.setAttribute(
      "aria-label",
      `Edit subject at ${subjectFrameLabel(reference.time)}${
        reference.jump
          ? ", new position"
          : reference.automatic
            ? ", tracked automatically"
            : ""
      }`,
    );
    button.disabled = editorLocked();
    button.addEventListener("click", () =>
      beginSubjectSelection(reference.id),
    );
    fragment.append(button);
  }

  elements.subjectReferences.replaceChildren(
    fragment,
    elements.clearSubject,
  );
  elements.subjectReferences.hidden = visibleReferences.length === 0;
}

function updateSubjectSummary(outputPreviewTime = undefined) {
  const count = subjectReferences.length;
  elements.subjectPicker.hidden = count === 0 && !isSelectingSubject;
  elements.clearSubject.hidden = count === 0;
  updateTrackingControls();
  renderSubjectReferences();
  renderCropPreview();
  renderSavedSubjectBox();
  refreshOutputPreview(outputPreviewTime);
}

function setSubjectSelectionMode(selecting) {
  isSelectingSubject = selecting;
  elements.subjectPicker.hidden =
    !selecting && subjectReferences.length === 0;
  elements.subjectOverlay.classList.toggle("active", selecting);
  elements.subjectOverlay.setAttribute(
    "aria-hidden",
    String(!selecting),
  );
  elements.subjectEditActions.hidden = !selecting;

  if (!selecting) {
    subjectInteraction = undefined;
    draftSubjectBox = undefined;
    previousSubjectBoxBeforeDraw = undefined;
    subjectJumpAutoSelectedByDistance = false;
    editingSubjectId = undefined;
    elements.subjectJump.checked = false;
    elements.subjectJumpRow.hidden = true;
    elements.subjectJumpRow.classList.remove("auto-selected");
    elements.preview.controls = previewControlsBeforeSubject;
  }

  updateSubjectSurfaceRect();
  renderSubjectBox();
  renderSavedSubjectBox();
  renderTrackingBox();
  renderSubjectReferences();
  updateTrackingControls();
  renderCropPreview();
  updateMode();
}

function beginSubjectSelection(
  referenceId = undefined,
  { forceNew = false } = {},
) {
  if (
    isRunning ||
    isSelectingSubject ||
    browserPreviewReadable !== true ||
    !sourceWidth ||
    !sourceHeight
  ) {
    return;
  }

  dismissSubjectOnboarding();
  if (mediaInfo?.canReencode !== false) {
    elements.verticalMode.checked = true;
  }
  pauseOutputPreview();
  elements.preview.pause();
  previewControlsBeforeSubject = elements.preview.controls;
  elements.preview.controls = false;
  const presentedTime = sourcePreviewTime();
  const currentTime = Number.isFinite(presentedTime)
    ? presentedTime
    : 0;
  const startsFresh =
    forceNew ||
    (trackingRequiresCorrection && referenceId === undefined);
  const requestedReference = startsFresh
    ? undefined
    : subjectReferences.find((item) => item.id === referenceId);
  const reference =
    requestedReference ??
    (startsFresh
      ? undefined
      : subjectReferenceAtTime(subjectReferences, currentTime, {
          duration,
          frameRate: mediaInfo?.frameRate,
        }));

  editingSubjectId = reference?.id;
  subjectSelectionTime = requestedReference?.time ?? currentTime;
  previousSubjectBoxBeforeDraw = trackingLiveBox
    ? { ...trackingLiveBox }
    : subjectBoxAtTime(subjectReferences, subjectSelectionTime);
  subjectJumpAutoSelectedByDistance = false;
  elements.subjectJumpRow.classList.remove("auto-selected");
  draftSubjectBox = reference
    ? { ...reference.box }
    : undefined;
  const suggestedSceneJump =
    !reference &&
    isSceneJumpSuggestion(
      suggestedSubjectJumpTime,
      subjectSelectionTime,
      trackingFrameInterval(
        mediaInfo?.frameRate,
        selectedTrackingFrameSkip(),
      ) * 0.6,
    );
  elements.subjectJump.checked =
    Boolean(reference?.jump) || suggestedSceneJump;
  elements.subjectJumpRow.hidden = !subjectReferences.some(
    (item) =>
      item.id !== reference?.id &&
      item.time < subjectSelectionTime - 0.005,
  );

  if (
    reference &&
    !sameSubjectFrame(sourcePreviewTime(), reference.time)
  ) {
    elements.preview.currentTime = reference.time;
  }

  setSubjectSelectionMode(true);
}

function cancelSubjectSelection() {
  setSubjectSelectionMode(false);
}

function applySubjectTimeBounds() {
  const bounds = subjectTimeBounds(subjectReferences);
  if (!bounds) {
    return;
  }

  setTime("start", bounds.start, false);
  if (bounds.end !== undefined) {
    setTime("end", bounds.end, false);
  }
}

function saveSubjectReference(
  reference,
  isNewReference,
  deleteFollowing,
) {
  recordSubjectEdit(
    deleteFollowing
      ? "the frame edit that deleted later boxes"
      : isNewReference
        ? "adding the subject frame"
        : "the subject frame edit",
  );
  if (deleteFollowing) {
    const savedFrame = frameIndexAtTime(
      reference.time,
      mediaInfo?.frameRate,
    );
    trackingConfidencePoints = trackingConfidencePoints.filter(
      (point) => {
        const pointFrame = frameIndexAtTime(
          point.time,
          mediaInfo?.frameRate,
        );
        return savedFrame !== undefined && pointFrame !== undefined
          ? pointFrame <= savedFrame
          : point.time <= reference.time + 0.005;
      },
    );
  }
  subjectReferences = stabilizeSubjectPath(
    replaceSubjectReference(
      subjectReferences,
      reference,
      deleteFollowing,
      0.005,
      mediaInfo?.frameRate,
    ),
  );
  if (
    isSceneJumpSuggestion(
      suggestedSubjectJumpTime,
      reference.time,
      trackingFrameInterval(
        mediaInfo?.frameRate,
        selectedTrackingFrameSkip(),
      ) * 0.6,
    )
  ) {
    suggestedSubjectJumpTime = undefined;
  }
  recordTrackingConfidence(reference.time, 1, true);
  trackingRequiresCorrection = false;
  setSubjectSelectionMode(false);
  if (isNewReference || deleteFollowing) {
    applySubjectTimeBounds();
  }
  updateSubjectSummary(sourcePreviewTime());

  setTrackingStatus("");
}

function confirmSubjectSelection() {
  if (!isValidSubjectBox(draftSubjectBox)) {
    return;
  }

  const matchingReference = subjectReferences.find(
    (reference) =>
      reference.id === editingSubjectId ||
      sameSubjectFrame(reference.time, subjectSelectionTime),
  );
  const isNewReference = !matchingReference;
  const referenceId = matchingReference?.id ?? nextSubjectId++;
  const reference = {
    id: referenceId,
    time: subjectSelectionTime,
    box: { ...draftSubjectBox },
    jump:
      !elements.subjectJumpRow.hidden &&
      elements.subjectJump.checked,
    automatic: false,
  };
  const laterReferences = subjectReferencesNeedingDecision(
    subjectReferences,
    subjectSelectionTime,
    referenceId,
    mediaInfo?.frameRate,
  );

  if (laterReferences.length > 0) {
    pendingSubjectSave = { reference, isNewReference };
    elements.laterSubjectDialogCopy.textContent = `There ${
      laterReferences.length === 1 ? "is 1 box" : `are ${laterReferences.length} boxes`
    } after ${subjectFrameLabel(subjectSelectionTime)}. Changing this position may make ${
      laterReferences.length === 1
        ? "that later box"
        : "those later boxes"
    } inaccurate.`;
    elements.laterSubjectDialog.returnValue = "";
    elements.laterSubjectDialog.showModal();
    return;
  }

  saveSubjectReference(reference, isNewReference, false);
}

function finishPendingSubjectSave() {
  const pending = pendingSubjectSave;
  const decision = elements.laterSubjectDialog.returnValue;
  pendingSubjectSave = undefined;

  if (!pending || (decision !== "keep" && decision !== "delete")) {
    return;
  }

  saveSubjectReference(
    pending.reference,
    pending.isNewReference,
    decision === "delete",
  );
}

function cancelPendingSubjectSave() {
  pendingSubjectSave = undefined;
  elements.laterSubjectDialog.returnValue = "";
}

function clearSubjectSelection(recordHistory = true) {
  if (recordHistory && subjectReferences.length > 0) {
    recordSubjectEdit("clearing the subject path");
  }
  if (!recordHistory) {
    subjectEditHistory.clear();
  }
  subjectReferences = [];
  trackingConfidencePoints = [];
  trackingRequiresCorrection = false;
  trackingStoppedFrameTime = undefined;
  trackingConfidenceDisplayRange = undefined;
  suggestedSubjectJumpTime = undefined;
  nextSubjectId = 1;
  draftSubjectBox = undefined;
  setTrackingStatus("");
  renderTrackingConfidenceTimeline();
  updateSubjectSummary();
  renderSubjectBox();
  renderSavedSubjectBox();
  updateMode();
}

function requestClearSubjectSelection() {
  if (subjectReferences.length === 0 || editorLocked()) {
    return;
  }
  elements.clearSubjectDialog.returnValue = "";
  elements.clearSubjectDialog.showModal();
}

function finishClearSubjectSelection() {
  if (elements.clearSubjectDialog.returnValue === "clear") {
    clearSubjectSelection();
  }
}

function captureTrackingFrame() {
  const scale = Math.min(
    1,
    TRACKING_MAX_FRAME_WIDTH / elements.preview.videoWidth,
  );
  const width = Math.max(
    2,
    Math.round(elements.preview.videoWidth * scale),
  );
  const height = Math.max(
    2,
    Math.round(elements.preview.videoHeight * scale),
  );
  trackingCanvas ??= document.createElement("canvas");
  trackingCanvas.width = width;
  trackingCanvas.height = height;
  const context = trackingCanvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });
  context.drawImage(elements.preview, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

function seekPreviewForTracking(time) {
  const frameRate = mediaInfo?.frameRate;
  const frameIndex = frameIndexAtTime(time, frameRate);
  const target = clamp(
    frameIndex === undefined
      ? time
      : (frameIndex + 0.25) / frameRate,
    0,
    duration,
  );
  if (
    elements.preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    Math.abs(elements.preview.currentTime - target) < 0.004
  ) {
    return Promise.resolve(sourcePreviewTime());
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("The next video frame took too long to load."));
    }, 10000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      elements.preview.removeEventListener("seeked", handleSeeked);
      elements.preview.removeEventListener("error", handleError);
    };
    const handleSeeked = () => {
      requestAnimationFrame(() => {
        cleanup();
        resolve(sourcePreviewTime());
      });
    };
    const handleError = () => {
      cleanup();
      reject(new Error("The next video frame could not be read."));
    };

    elements.preview.addEventListener("seeked", handleSeeked, {
      once: true,
    });
    elements.preview.addEventListener("error", handleError, {
      once: true,
    });
    elements.preview.currentTime = target;
  });
}

function yieldTrackingFrame(frameStartedAt, frameInterval) {
  const remainingMilliseconds = trackingWaitMilliseconds(
    frameInterval,
    1,
    performance.now() - frameStartedAt,
  );
  return new Promise((resolve) =>
    window.setTimeout(resolve, remainingMilliseconds),
  );
}

function stabilizeSubjectPath(
  references,
  { fixedBeforeTime = undefined } = {},
) {
  return stabilizeTrackedReferences(
    [...references].sort((left, right) => left.time - right.time),
    {
      sourceWidth,
      sourceHeight,
      cropSize: centeredVerticalSize(sourceWidth, sourceHeight),
      fixedBeforeTime,
    },
  ).map((reference) => ({
    ...reference,
    id: reference.id ?? nextSubjectId++,
    box: { ...reference.box },
  }));
}

function saveTrackedReferences(samples, sessionAnchorTime) {
  let combinedReferences = [...subjectReferences];

  for (const sample of samples.slice(1)) {
    const matchingIndex = combinedReferences.findIndex(
      (reference) =>
        reference.automatic &&
        sameSubjectFrame(reference.time, sample.time),
    );
    const matchingReference =
      matchingIndex >= 0
        ? combinedReferences[matchingIndex]
        : undefined;
    combinedReferences = [
      ...(matchingIndex >= 0
        ? combinedReferences.filter((_, index) => index !== matchingIndex)
        : combinedReferences),
      {
        ...sample,
        ...(matchingReference ? { id: matchingReference.id } : {}),
        box: { ...sample.box },
        jump: false,
        automatic: true,
      },
    ];
  }

  const latestTime = combinedReferences
    .filter((reference) => Number.isFinite(reference.time))
    .sort((left, right) => left.time - right.time)
    .at(-1)?.time;
  subjectReferences = stabilizeSubjectPath(combinedReferences, {
    fixedBeforeTime: Math.max(
      Number.isFinite(sessionAnchorTime)
        ? sessionAnchorTime
        : Number.NEGATIVE_INFINITY,
      Number.isFinite(latestTime)
        ? latestTime - CROP_STABILIZATION_WINDOW_SECONDS
        : Number.NEGATIVE_INFINITY,
    ),
  });
  applySubjectTimeBounds();
  updateSubjectSummary();
}

function requestTrackingRestartDecision(currentTime, latestTrackedTime) {
  return new Promise((resolve) => {
    elements.restartTrackingDialogTitle.textContent =
      `Restart tracking from ${subjectFrameLabel(currentTime)}?`;
    elements.restartTrackingDialogCopy.textContent =
      `Tracking already reaches ${subjectFrameLabel(latestTrackedTime)}. Redraw the subject here before replacing the later tracking.`;
    elements.restartTrackingDialog.returnValue = "";
    elements.restartTrackingDialog.addEventListener(
      "close",
      () => resolve(elements.restartTrackingDialog.returnValue),
      { once: true },
    );
    elements.restartTrackingDialog.showModal();
  });
}

async function followSubjectForward() {
  if (trackingRequiresCorrection) {
    setTrackingStatus(
      "Tracking needs a new subject box. Draw around the subject in the preview, then save the subject position before tracking again.",
      true,
    );
    beginSubjectSelection();
    return;
  }
  if (
    isRunning ||
    isSelectingSubject ||
    isTrackingSubject ||
    browserPreviewReadable !== true ||
    subjectReferences.length === 0
  ) {
    return;
  }

  const currentTrackingTime = sourcePreviewTime();
  const latestAutomaticReference = subjectReferences
    .filter((reference) => reference.automatic)
    .at(-1);
  if (
    trackingRestartRequiresDecision(
      subjectReferences,
      currentTrackingTime,
      mediaInfo?.frameRate,
      0.005,
      trackingStoppedFrameTime,
    )
  ) {
    const decision = await requestTrackingRestartDecision(
      currentTrackingTime,
      latestAutomaticReference?.time,
    );
    if (decision === "redraw") {
      trackingRequiresCorrection = true;
      setTrackingStatus("");
      beginSubjectSelection(undefined, { forceNew: true });
      return;
    }
    if (decision !== "continue") {
      return;
    }
  }

  const anchor = subjectReferences.at(-1);
  if (anchor.time >= duration - 0.005) {
    setTrackingStatus("The selected frame is already at the end.", true);
    return;
  }

  const frameSkip = selectedTrackingFrameSkip();
  const baseFrameInterval = trackingFrameInterval(
    mediaInfo?.frameRate,
  );
  const frameInterval = trackingFrameInterval(
    mediaInfo?.frameRate,
    frameSkip,
  );
  const lowConfidenceFrameLimit = Math.max(
    2,
    Math.ceil(TRACKING_LOW_CONFIDENCE_SECONDS / frameInterval),
  );

  recordSubjectEdit("automatic subject tracking");
  trackingStoppedFrameTime = undefined;
  suggestedSubjectJumpTime = undefined;
  isTrackingSubject = true;
  trackingSessionAnchorTime = anchor.time;
  stopTrackingRequested = false;
  pendingFrameStepAfterTracking = 0;
  trackingLiveBox = { ...anchor.box };
  previewControlsBeforeTracking = elements.preview.controls;
  previewMutedBeforeTracking = elements.preview.muted;
  elements.preview.pause();
  elements.preview.controls = false;
  elements.preview.muted = true;
  pauseOutputPreview();
  elements.verticalMode.checked = true;
  setTime("end", anchor.time, false);
  setTrackingStatus(
    `Tracking · ${frameSkip}×${
      Number.isFinite(mediaInfo?.frameRate)
        ? ` · ${Number(
            (mediaInfo.frameRate / frameSkip).toFixed(2),
          )}/sec`
        : ""
    }`,
    false,
    "Press Space to stop",
  );
  renderTrackingBox();
  renderTrackingStabilizationTail();
  updateTrackingControls();
  updateMode();

  let template;
  let previousFrame;
  let currentBox = { ...anchor.box };
  const trackedSamples = [
    {
      time: anchor.time,
      box: { ...anchor.box },
      cropLeft: anchor.cropLeft,
      jump: false,
      automatic: false,
    },
  ];
  let lastGoodTime = anchor.time;
  let lowConfidenceFrames = 0;
  let stopReason = "stopped";
  let failedTrackingTime;
  trackingLastGoodTime = anchor.time;
  trackingRequestedStopTime = undefined;
  if (
    !trackingConfidencePoints.some(
      (point) => Math.abs(point.time - anchor.time) < 0.01,
    )
  ) {
    recordTrackingConfidence(anchor.time, 1, !anchor.automatic);
  }

  try {
    await seekPreviewForTracking(anchor.time);
    previousFrame = captureTrackingFrame();
    template = createTrackingTemplate(previousFrame, currentBox);

    for (
      let time = anchor.time + frameInterval;
      time <= duration + 0.001;
      time += frameInterval
    ) {
      const frameStartedAt = performance.now();
      if (stopTrackingRequested) {
        break;
      }

      const requestedFrameTime = Math.min(time, duration);
      const presentedTrackingTime = await seekPreviewForTracking(
        requestedFrameTime,
      );
      const frameTime = Number.isFinite(presentedTrackingTime)
        ? presentedTrackingTime
        : requestedFrameTime;
      if (stopTrackingRequested) {
        break;
      }
      const frame = captureTrackingFrame();
      const sceneChange = sceneChangeScore(previousFrame, frame);
      if (sceneChange.detected) {
        recordTrackingConfidence(frameTime, 0);
        stopReason = "scene";
        failedTrackingTime = frameTime;
        suggestedSubjectJumpTime = frameTime;
        break;
      }
      const templateResult = trackTemplate(
        frame,
        template,
        currentBox,
      );
      const flowResult = trackOpticalFlow(
        previousFrame,
        frame,
        currentBox,
      );
      const result = selectTrackingResult(
        TRACKING_METHOD,
        templateResult,
        flowResult,
      );
      previousFrame = frame;
      recordTrackingConfidence(frameTime, result.confidence);

      if (result.confidence < TRACKING_CONFIDENCE_THRESHOLD) {
        lowConfidenceFrames += 1;
        setTrackingStatus(
          `Checking the subject at ${subjectFrameLabel(frameTime)}…`,
        );
        if (
          lowConfidenceFrames >= lowConfidenceFrameLimit
        ) {
          stopReason = "confidence";
          failedTrackingTime = frameTime;
          break;
        }
      } else {
        lowConfidenceFrames = 0;
        currentBox = result.box;
        trackedSamples.push({
          time: frameTime,
          box: { ...currentBox },
          cropLeft: undefined,
          jump: false,
          automatic: true,
        });
        lastGoodTime = frameTime;
        trackingLastGoodTime = frameTime;
        trackingLiveBox = { ...currentBox };
        template = updateTrackingTemplate(
          template,
          frame,
          currentBox,
          result.confidence > 0.62 ? 0.08 : 0.03,
        );
        elements.endTime.value = frameTime.toFixed(2);
        elements.endRange.value = String(frameTime);
        updateSelectionSummary();
        renderTrackingBox();
        renderCropPreview();

        const followedDuration = frameTime - anchor.time;
        setTrackingStatus(
          `${formatTime(followedDuration)} · ${Math.round(
            result.confidence * 100,
          )}%`,
          false,
          "Press Space to stop",
        );
      }

      if (frameTime >= duration - 0.005) {
        stopReason = "end";
        break;
      }
      await yieldTrackingFrame(
        frameStartedAt,
        baseFrameInterval,
      );
    }
  } catch (error) {
    console.error(error);
    stopReason = "error";
  } finally {
    if (trackedSamples.length > 1) {
      saveTrackedReferences(trackedSamples, trackingSessionAnchorTime);
    }

    if (
      stopReason === "stopped" &&
      Number.isFinite(trackingRequestedStopTime)
    ) {
      try {
        await seekPreviewForTracking(trackingRequestedStopTime);
      } catch {
        // The saved timestamp is still correct if the preview cannot seek.
      }
    }

    trackingStoppedFrameTime =
      stopReason === "stopped" ? sourcePreviewTime() : undefined;
    isTrackingSubject = false;
    renderTrackingStabilizationTail();
    if (["scene", "confidence", "error"].includes(stopReason)) {
      trackingRequiresCorrection = true;
    }
    elements.preview.pause();
    elements.preview.controls = previewControlsBeforeTracking;
    elements.preview.muted = previewMutedBeforeTracking;
    trackingLiveBox = undefined;
    trackingSessionAnchorTime = undefined;
    stopTrackingRequested = false;
    trackingLastGoodTime = undefined;
    trackingRequestedStopTime = undefined;
    renderTrackingBox();
    updateSubjectSummary();
    updateMode();
    elements.preview.focus({ preventScroll: true });

    if (stopReason === "scene") {
      setTrackingStatus(
        `A scene change was detected at ${subjectFrameLabel(
          failedTrackingTime,
        )}. Draw around the subject in this frame; “New position” will be selected automatically.`,
        true,
      );
    } else if (stopReason === "confidence") {
      updateTrackingControls();
      setTrackingStatus(
        `Tracking lost at ${subjectFrameLabel(
          failedTrackingTime,
        )}. Draw around the subject in this frame, then save it before tracking again.`,
        true,
      );
      beginSubjectSelection();
    } else if (stopReason === "error") {
      setTrackingStatus(
        "Tracking stopped because a video frame could not be read. Select the subject again at the current frame to continue.",
        true,
      );
    } else {
      setTrackingStatus("");
    }

    if (pendingFrameStepAfterTracking !== 0) {
      const pendingFrameCount = pendingFrameStepAfterTracking;
      pendingFrameStepAfterTracking = 0;
      const pendingDirection = Math.sign(pendingFrameCount);
      for (
        let frame = 0;
        frame < Math.abs(pendingFrameCount);
        frame += 1
      ) {
        stepPreviewFrame(pendingDirection);
      }
    }
  }
}

function stopFollowingSubject() {
  if (!isTrackingSubject || stopTrackingRequested) {
    return;
  }
  stopTrackingRequested = true;
  trackingRequestedStopTime = trackingLastGoodTime;
  elements.stopFollowing.disabled = true;
  setTrackingStatus(
    `Stopping at ${subjectFrameLabel(trackingRequestedStopTime)}…`,
  );
}

function pointerPosition(event) {
  return normalizedPoint(
    event.clientX,
    event.clientY,
    elements.subjectSurface.getBoundingClientRect(),
  );
}

function suggestNewPositionFromDraft() {
  if (!isValidSubjectBox(draftSubjectBox)) {
    return;
  }

  const distant = isDistantSubjectPosition(
    previousSubjectBoxBeforeDraw,
    draftSubjectBox,
  );
  if (!distant) {
    if (subjectJumpAutoSelectedByDistance) {
      elements.subjectJump.checked = false;
      subjectJumpAutoSelectedByDistance = false;
    }
    return;
  }

  if (elements.subjectJump.checked) {
    return;
  }

  elements.subjectJump.checked = true;
  elements.subjectJumpRow.hidden = false;
  subjectJumpAutoSelectedByDistance = true;
  elements.subjectJumpRow.classList.remove("auto-selected");
  void elements.subjectJumpRow.offsetWidth;
  elements.subjectJumpRow.classList.add("auto-selected");
}

function beginSubjectPointerInteraction(event) {
  if (!isSelectingSubject || (event.button !== 0 && event.pointerType !== "touch")) {
    return;
  }

  if (event.target.closest("#cancel-subject")) {
    return;
  }

  const start = pointerPosition(event);
  const originalBox = draftSubjectBox
    ? { ...draftSubjectBox }
    : undefined;
  const handle = event.target.dataset.handle;
  const movingBox =
    originalBox && event.target.closest("#subject-box");
  const type = handle ? "resize" : movingBox ? "move" : "draw";

  subjectInteraction = {
    pointerId: event.pointerId,
    type,
    handle,
    start,
    originalBox,
  };
  if (type === "draw") {
    draftSubjectBox = boxFromPoints(start, start);
    renderSubjectBox();
  }

  elements.subjectSurface.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function updateSubjectPointerInteraction(event) {
  if (subjectInteraction?.pointerId !== event.pointerId) {
    return;
  }

  const point = pointerPosition(event);
  const deltaX = point.x - subjectInteraction.start.x;
  const deltaY = point.y - subjectInteraction.start.y;

  if (subjectInteraction.type === "draw") {
    draftSubjectBox = boxFromPoints(subjectInteraction.start, point);
  } else if (subjectInteraction.type === "move") {
    draftSubjectBox = moveBox(
      subjectInteraction.originalBox,
      deltaX,
      deltaY,
    );
  } else {
    const surfaceRect = elements.subjectSurface.getBoundingClientRect();
    const minimumSize = Math.max(
      MIN_SUBJECT_BOX_SIZE,
      24 / surfaceRect.width,
      24 / surfaceRect.height,
    );
    draftSubjectBox = resizeBox(
      subjectInteraction.originalBox,
      subjectInteraction.handle,
      deltaX,
      deltaY,
      minimumSize,
    );
  }

  suggestNewPositionFromDraft();
  renderSubjectBox();
  event.preventDefault();
}

function finishSubjectPointerInteraction(event) {
  if (subjectInteraction?.pointerId !== event.pointerId) {
    return;
  }

  if (
    subjectInteraction.type === "draw" &&
    !isValidSubjectBox(draftSubjectBox)
  ) {
    draftSubjectBox = subjectInteraction.originalBox;
  }

  if (elements.subjectSurface.hasPointerCapture(event.pointerId)) {
    elements.subjectSurface.releasePointerCapture(event.pointerId);
  }
  subjectInteraction = undefined;
  renderSubjectBox();
}

function beginPreviewSubjectGesture(event) {
  if (
    editorLocked() ||
    browserPreviewReadable !== true ||
    !sourceWidth ||
    !sourceHeight ||
    (event.button !== 0 && event.pointerType !== "touch")
  ) {
    return;
  }

  const surfaceRect =
    elements.subjectSurface.getBoundingClientRect();
  const controlGuard = elements.preview.controls
    ? Math.min(
        VIDEO_CONTROLS_GUARD_HEIGHT,
        surfaceRect.height * 0.24,
      )
    : 0;
  const insideSelectableArea =
    event.clientX >= surfaceRect.left &&
    event.clientX <= surfaceRect.right &&
    event.clientY >= surfaceRect.top &&
    event.clientY <= surfaceRect.bottom - controlGuard;

  if (!insideSelectableArea) {
    return;
  }

  dismissSubjectOnboarding();
  previewSubjectGesture = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    started: false,
  };
}

function updatePreviewSubjectGesture(event) {
  if (previewSubjectGesture?.pointerId !== event.pointerId) {
    return;
  }

  if (!previewSubjectGesture.started) {
    const distance = Math.hypot(
      event.clientX - previewSubjectGesture.startClientX,
      event.clientY - previewSubjectGesture.startClientY,
    );
    if (distance < SUBJECT_DRAG_THRESHOLD) {
      return;
    }

    // Stop playback as soon as this becomes a drag. Preventing the current
    // pointer event also blocks the video's native drag/click behavior from
    // restarting playback when the pointer is released.
    elements.preview.pause();
    pauseOutputPreview();
    event.preventDefault();
    beginSubjectSelection();
    if (!isSelectingSubject) {
      previewSubjectGesture = undefined;
      return;
    }

    previewSubjectGesture.started = true;
    previewSubjectGesture.originalBox = draftSubjectBox
      ? { ...draftSubjectBox }
      : undefined;
    previewSubjectGesture.start = normalizedPoint(
      previewSubjectGesture.startClientX,
      previewSubjectGesture.startClientY,
      elements.subjectSurface.getBoundingClientRect(),
    );
  }

  draftSubjectBox = boxFromPoints(
    previewSubjectGesture.start,
    pointerPosition(event),
  );
  suggestNewPositionFromDraft();
  renderSubjectBox();
  event.preventDefault();
}

function finishPreviewSubjectGesture(event) {
  if (previewSubjectGesture?.pointerId !== event.pointerId) {
    return;
  }

  if (previewSubjectGesture.started) {
    if (!isValidSubjectBox(draftSubjectBox)) {
      draftSubjectBox = previewSubjectGesture.originalBox;
    }
    suppressPreviewClick = true;
    setTimeout(() => {
      suppressPreviewClick = false;
    }, 0);
    renderSubjectBox();
    event.preventDefault();
  }

  previewSubjectGesture = undefined;
}

function toggleSourcePreviewPlayback() {
  pauseOutputPreview();
  if (elements.preview.paused || elements.preview.ended) {
    void elements.preview.play().catch(() => {});
  } else {
    elements.preview.pause();
  }
}

function handlePreviewClick(event) {
  const previewRect = elements.preview.getBoundingClientRect();
  const controlGuard = elements.preview.controls
    ? Math.min(
        VIDEO_CONTROLS_GUARD_HEIGHT,
        previewRect.height * 0.24,
      )
    : 0;
  const clickedNativeControls =
    controlGuard > 0 &&
    event.clientY >= previewRect.bottom - controlGuard;
  const wouldStartSavedSubjectVideo =
    subjectReferences.length > 0 &&
    elements.preview.paused &&
    !clickedNativeControls;
  const shouldBlockPlayback =
    suppressPreviewClick ||
    trackingRequiresCorrection ||
    wouldStartSavedSubjectVideo;

  if (clickedNativeControls && !shouldBlockPlayback) {
    return;
  }

  suppressPreviewClick = false;
  event.preventDefault();
  event.stopPropagation();

  if (
    !shouldBlockPlayback &&
    !editorLocked() &&
    browserPreviewReadable === true
  ) {
    toggleSourcePreviewPlayback();
  }
}

function handlePreviewPlaybackStart() {
  if (isSelectingSubject || previewSubjectGesture?.started) {
    elements.preview.pause();
    return;
  }
  pauseOutputPreview();
}

function renderKeyframeMarks() {
  const step = Math.max(
    1,
    Math.ceil(keyframes.length / MAX_VISIBLE_KEYFRAME_MARKS),
  );
  const visibleKeyframes = keyframes.filter(
    (_, index) => index % step === 0 || index === keyframes.length - 1,
  );

  for (const track of [elements.startKeyframes, elements.endKeyframes]) {
    const fragment = document.createDocumentFragment();
    for (const keyframe of visibleKeyframes) {
      const mark = document.createElement("span");
      mark.className = "keyframe-mark";
      mark.style.left = `${(keyframe / duration) * 100}%`;
      fragment.append(mark);
    }
    track.replaceChildren(fragment);
    track.hidden = visibleKeyframes.length === 0;
  }
}

function resetKeyframes() {
  keyframes = [];
  renderKeyframeMarks();
  elements.snapKeyframes.disabled = true;
  elements.keyframeSummary.textContent = "";
  elements.keyframeSummary.hidden = true;
}

function updateMode() {
  const hasSubjectFrames = subjectReferences.length > 0;
  if (hasSubjectFrames) {
    elements.verticalMode.checked = true;
  }
  const vertical = elements.verticalMode.checked;
  elements.outputPreviewStage.classList.toggle("vertical", vertical);
  const streamingInput = mediaInfo?.streamingInput === true;
  const subjectGuided = vertical && subjectReferences.length > 0;
  const cropSize = centeredVerticalSize(sourceWidth, sourceHeight);
  const videoSpeed = selectedVideoSpeed();
  const selectedRange = selection();
  const selectionSeconds = Number.isFinite(
    selectedRange.end - selectedRange.start,
  )
    ? Math.max(0, selectedRange.end - selectedRange.start)
    : 0;
  const reencodeAvailable =
    mediaInfo?.readable !== false && mediaInfo?.canReencode !== false;
  const mediaHasAudio =
    mediaInfo === undefined || Boolean(mediaInfo.audioCodec);
  const locked = editorLocked();

  if (vertical || streamingInput || videoSpeed !== 1) {
    elements.snapKeyframes.checked = false;
  } else if (!reencodeAvailable) {
    elements.snapKeyframes.checked = true;
  }

  const modeState = editingModeState({
    isRunning: locked,
    vertical,
    canReencode: reencodeAvailable,
    snapping: elements.snapKeyframes.checked,
  });

  elements.fileInput.disabled = locked;
  elements.startTime.disabled = locked;
  elements.endTime.disabled = locked;
  elements.startRange.disabled = locked;
  elements.endRange.disabled = locked;
  elements.clearSubject.disabled = locked;
  elements.verticalMode.disabled =
    locked || !reencodeAvailable || hasSubjectFrames;
  if (!mediaHasAudio) {
    elements.keepAudio.checked = false;
  }
  elements.keepAudio.disabled =
    locked || !mediaHasAudio || videoSpeed !== 1;
  elements.videoSpeed.disabled = locked;
  elements.audioHelp.textContent =
    videoSpeed !== 1
      ? "Muted when video speed is changed."
      : mediaHasAudio
        ? "Turn this off to create a silent video."
        : "This video has no audio track.";
  elements.outputPreviewMedia.muted = !elements.keepAudio.checked;
  updatePlayheadButtons();
  updateFrameStepControls();
  elements.cutModeHelp.textContent = streamingInput
    ? "Large videos use exact timing so the full file is never copied into memory."
    : !reencodeAvailable
    ? "Exact timing is not available for this video."
    : vertical
      ? "Exact timing is included in vertical mode."
      : modeState.exactCut
        ? "Exact timing is on. This takes longer."
        : keyframes.length
          ? "On: snaps to orange marks and avoids quality loss. Off: uses exact timing."
          : "Fast cutting is on. Turn it off for exact timing.";
  elements.verticalHelp.textContent = !reencodeAvailable
    ? "Not available for this video. Fast cutting still works."
    : hasSubjectFrames
      ? "Required when subjects are selected."
      : subjectGuided
        ? "Tracks the subject between your selected frames."
        : "Keeps the center of the frame.";
  for (const track of [elements.startKeyframes, elements.endKeyframes]) {
    track.classList.toggle("inactive", modeState.exactCut);
  }
  elements.snapKeyframes.disabled =
    modeState.snapDisabled || streamingInput;
  elements.cutButton.textContent = `${
    vertical ? "Cut & verticalize" : "Cut video"
  }${videoSpeed !== 1 ? " · Muted" : ""}`;
  elements.cropSummary.hidden = !vertical || !sourceWidth || !sourceHeight;
  elements.cropSummary.textContent =
    vertical && sourceWidth && sourceHeight
      ? `${cropSize.width} × ${cropSize.height} · ${(
          selectionSeconds / videoSpeed
        ).toFixed(2)} seconds`
      : "";
  updateOutputPreviewControls();
  updateTrackingControls();
  updateSelectionSummary();
}

function updatePlayheadButtons() {
  const currentTime = elements.preview.currentTime;
  const unavailable =
    editorLocked() ||
    browserPreviewReadable === false ||
    !Number.isFinite(currentTime);

  elements.setStart.disabled =
    unavailable ||
    sameDisplayedTime(currentTime, elements.startTime.value);
  elements.setEnd.disabled =
    unavailable ||
    sameDisplayedTime(currentTime, elements.endTime.value);
}

function updateFrameStepControls() {
  const frameRate = mediaInfo?.frameRate;

  elements.videoFps.textContent = Number.isFinite(frameRate)
    ? `${Number(frameRate.toFixed(2))} fps`
    : "";
  elements.videoFps.hidden = !Number.isFinite(frameRate);

  if (
    !trackingSpeedRecommendationApplied &&
    Number.isFinite(frameRate)
  ) {
    const suggestedSpeed = suggestedTrackingFrameSkip(frameRate);
    elements.trackingFrameSkip.value = String(suggestedSpeed);
    trackingSpeedRecommendationApplied = true;
  }

  const highFrameRate = Number.isFinite(frameRate) && frameRate > 50;
  const fourTimesOption = elements.trackingFrameSkip.querySelector(
    'option[value="4"]',
  );
  fourTimesOption.textContent = highFrameRate
    ? "4× · Suggested"
    : "4×";
  elements.speedTooltip.dataset.tooltip = highFrameRate
    ? `${Number(frameRate.toFixed(2))} fps detected · 4× suggested`
    : "1× for fast-moving subjects · 10× for very steady subjects";
  elements.speedTooltip.setAttribute(
    "aria-label",
    elements.speedTooltip.dataset.tooltip,
  );

  if (isSelectingSubject) {
    elements.frameStepHelp.textContent =
      `Selecting ${subjectFrameLabel(
        subjectSelectionTime,
      )}. Draw the box · Spacebar activates the orange button · Ctrl+Z cancels.`;
    return;
  }

  elements.frameStepHelp.textContent =
    "Arrow keys: one frame · Ctrl+Z: undo · Spacebar activates the orange button";
}

function stepPreviewFrame(direction) {
  const frameDirection = Math.sign(direction);
  if (frameDirection === 0) {
    return;
  }

  if (isTrackingSubject) {
    pendingFrameStepAfterTracking += frameDirection;
    stopFollowingSubject();
    return;
  }

  if (isSelectingSubject) {
    // A subject box belongs to one exact source frame. Leave the unsaved edit
    // before moving so the box cannot silently become attached to another one.
    setSubjectSelectionMode(false);
  }

  if (
    browserPreviewReadable !== true ||
    mediaInfo?.invalidSeekIndex ||
    !Number.isFinite(elements.preview.currentTime)
  ) {
    return;
  }

  pauseOutputPreview();
  elements.preview.pause();
  const targetTime = frameStepTime(
    elements.preview.currentTime,
    frameDirection,
    mediaInfo?.frameRate,
    duration,
  );
  elements.preview.currentTime = targetTime;
  if (
    subjectReferences.length > 0 &&
    subjectBoxAtTime(subjectReferences, targetTime)
  ) {
    renderViewingSubjectFrameStatus(targetTime);
  } else {
    setTrackingStatus("");
  }
  updateFrameStepControls();
}

function handlePreviewKeyboardShortcut(event) {
  const isPlainSpace =
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    (event.code === "Space" ||
      event.key === " " ||
      event.key === "Spacebar");
  const targetElement =
    event.target instanceof Element ? event.target : undefined;
  const targetInput = targetElement?.closest("input");
  const targetAcceptsText = Boolean(
    targetElement?.closest("textarea, [contenteditable]") ||
      (targetInput instanceof HTMLInputElement &&
        ["text", "search", "email", "url", "tel", "password"].includes(
          targetInput.type,
        )),
  );
  const targetIsEditable =
    targetElement &&
    Boolean(
      targetElement.closest(
        "input, textarea, [contenteditable]",
      ),
    );
  if (isPlainSpace && !targetAcceptsText && !event.defaultPrevented) {
    const action = spaceShortcutAction({
      isTracking: isTrackingSubject,
      isSelecting: isSelectingSubject,
      canSaveSelection:
        !elements.subjectEditActions.hidden &&
        !elements.confirmSubject.disabled,
      canFollow:
        !elements.subjectTrackingActions.hidden &&
        !elements.followSubject.disabled,
    });
    const previewHasFocus =
      event.target === elements.preview ||
      document.activeElement === elements.preview;
    if (action === "none" && !previewHasFocus) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (action === "stop-following") {
      stopFollowingSubject();
    } else if (action === "save-selection") {
      confirmSubjectSelection();
    } else if (action === "follow-forward") {
      void followSubjectForward();
    } else if (
      !editorLocked() &&
      browserPreviewReadable === true
    ) {
      toggleSourcePreviewPlayback();
    }
    return;
  }

  const primaryModifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (
    !event.altKey &&
    !targetIsEditable &&
    primaryModifier &&
    (key === "z" || (event.ctrlKey && key === "y"))
  ) {
    event.preventDefault();
    if ((key === "z" && event.shiftKey) || key === "y") {
      redoSubjectEdit();
    } else {
      undoSubjectEdit();
    }
    return;
  }

  const isPlainFrameArrow =
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    (event.key === "ArrowLeft" || event.key === "ArrowRight");
  if (isPlainFrameArrow) {
    event.preventDefault();
    event.stopPropagation();
    stepPreviewFrame(event.key === "ArrowLeft" ? -1 : 1);
    return;
  }

  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    (event.target instanceof Element &&
      event.target.closest(
        "input, textarea, select, #tracking-confidence-canvas, [contenteditable]",
      ))
  ) {
    return;
  }

}

function updateSelectionSummary() {
  const { start, end } = selection();
  const { valid, text } = describeSelection({
    start,
    end,
    duration,
    vertical: elements.verticalMode.checked,
    snapToKeyframes: elements.snapKeyframes.checked,
    keyframes,
    keepAudio: elements.keepAudio.checked,
    videoSpeed: selectedVideoSpeed(),
  });

  elements.selectionSummary.textContent = text;
  elements.selectionSummary.classList.toggle("error", !valid);
  elements.cutButton.disabled =
    !valid || editorLocked() || mediaInfo?.readable !== true;
  return valid;
}

function setTime(kind, rawValue, seekPreview = false, snap = false) {
  const clampedValue = clamp(rawValue, 0, duration);
  const value =
    snap && elements.snapKeyframes.checked && keyframes.length
      ? nearestKeyframe(clampedValue, duration, keyframes)
      : clampedValue;
  const roundedValue = Number(value.toFixed(2));
  // Rounding a fractional media duration upward must not place the default
  // end time beyond the source (for example, 3.008 becoming 3.01).
  const displayedValue =
    kind === "end" && roundedValue > duration
      ? Math.floor(value * 100) / 100
      : roundedValue;
  elements[`${kind}Time`].value = displayedValue.toFixed(2);
  elements[`${kind}Range`].value = String(displayedValue);

  if (seekPreview && browserPreviewReadable !== false) {
    elements.preview.currentTime = value;
  }

  updateSelectionSummary();
  updatePlayheadButtons();
  refreshOutputPreview();
}

function resetDownload() {
  if (downloadURL) {
    URL.revokeObjectURL(downloadURL);
    downloadURL = undefined;
  }
  elements.downloadControls.hidden = true;
  elements.outputFilename.value = "";
  elements.outputFilename.removeAttribute("placeholder");
  elements.downloadLink.hidden = true;
  elements.downloadLink.removeAttribute("href");
  void downloadCleanup?.();
  downloadCleanup = undefined;
}

function updateDownloadFilename() {
  const filename = elements.outputFilename.value.trim();
  elements.downloadLink.download =
    filename || elements.outputFilename.placeholder;
}

function resetFFmpegEngine() {
  ffmpeg?.terminate();
  ffmpeg = undefined;
  decoderNames = undefined;
  activeLogSink = undefined;
  preparedInputName = undefined;
  preparedRevision = -1;
}

function releaseLoadedVideo() {
  stopCropPreviewAnimation();
  previewPresentedTime = undefined;
  elements.preview.pause();
  elements.preview.removeAttribute("src");
  elements.preview.load();
  resetOutputPreviewMedia();

  if (previewURL) {
    URL.revokeObjectURL(previewURL);
    previewURL = undefined;
  }

  selectedFile = undefined;
  resetFFmpegEngine();
}

function setBusy(busy) {
  isRunning = busy;
  if (busy) {
    pauseOutputPreview();
  }
  elements.cancelButton.hidden = !busy;
  renderSubjectReferences();
  updateMode();
  updateSelectionSummary();
}

function setStatus(
  message,
  showProgress = false,
  indeterminate = false,
  isError = false,
  showEstimate = false,
) {
  elements.resultPanel.hidden = false;
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
  elements.progress.hidden = !showProgress;
  elements.timeEstimate.hidden = !showEstimate;
  if (indeterminate) {
    elements.progress.removeAttribute("value");
  } else {
    elements.progress.value = 0;
  }
}

function startProcessingEstimate(
  message,
  processLabel,
  segmentDuration,
) {
  const now = performance.now();
  processingStepTracker = new ProcessingStepTracker(processLabel);
  elements.processingStepProcessLabel.textContent = processLabel;
  activeProcessingStepId = "prepare";
  processingStepAction = "Checking the source";
  processingSegmentDuration = segmentDuration;
  processingStepTracker.start("prepare", now);
  processingEstimateStartedAt = undefined;
  lastProcessingProgressAt = undefined;
  processingTimeEstimator = undefined;
  setStatus(message, true, true);
  elements.processingSteps.hidden = false;
  elements.timeEstimate.hidden = true;
  clearInterval(processingEstimateTimer);
  processingEstimateTimer = setInterval(
    updateProcessingWaitMessage,
    1000,
  );
  renderProcessingSteps();
}

function stopProcessingEstimate() {
  clearInterval(processingEstimateTimer);
  processingEstimateTimer = undefined;
  processingEstimateStartedAt = undefined;
  lastProcessingProgressAt = undefined;
  processingTimeEstimator = undefined;
  processingSegmentDuration = undefined;
  elements.timeEstimate.hidden = true;
}

function startProcessingStep(stepId, action) {
  if (!processingStepTracker) {
    return;
  }

  const now = performance.now();
  processingStepTracker.start(stepId, now);
  activeProcessingStepId = stepId;
  processingStepAction = action;
  elements.progress.hidden = false;
  elements.progress.setAttribute(
    "aria-label",
    `${processingStepTracker.steps.find(({ id }) => id === stepId)?.label ?? "Current step"} progress`,
  );
  elements.progress.removeAttribute("aria-valuetext");

  if (stepId === "process") {
    processingEstimateStartedAt = now;
    lastProcessingProgressAt = now;
    processingTimeEstimator = new ProgressTimeEstimator();
    elements.progress.value = 0;
    lastProcessingPreviewUpdateAt = 0;
    syncOutputPreviewToProcessing(0, true);
  } else {
    processingEstimateStartedAt = undefined;
    lastProcessingProgressAt = undefined;
    processingTimeEstimator = undefined;
    elements.progress.removeAttribute("value");
    if (stepId === "finalize") {
      syncOutputPreviewToProcessing(1, true);
    }
  }
  renderProcessingSteps();
}

function completeProcessingSteps() {
  if (!processingStepTracker || !activeProcessingStepId) {
    return;
  }

  processingStepTracker.complete(
    activeProcessingStepId,
    performance.now(),
  );
  activeProcessingStepId = undefined;
  elements.progress.hidden = true;
  restoreOutputPreviewMode();
  renderProcessingSteps();
}

function stopProcessingSteps(state) {
  if (!processingStepTracker) {
    return;
  }

  processingStepTracker.stop(state, performance.now());
  activeProcessingStepId = undefined;
  elements.progress.hidden = true;
  restoreOutputPreviewMode();
  renderProcessingSteps();
}

function setProcessingStepAction(action) {
  processingStepAction = action;
  renderProcessingSteps();
}

function renderProcessingSteps() {
  if (!processingStepTracker) {
    return;
  }

  const now = performance.now();
  const estimate = processingTimeEstimator?.snapshot();
  const silentSeconds =
    lastProcessingProgressAt === undefined
      ? 0
      : (now - lastProcessingProgressAt) / 1000;

  for (const step of processingStepTracker.snapshot(now)) {
    const row = elements.processingStepRows[step.id];
    const detail = elements.processingStepDetails[step.id];
    row.dataset.state = step.state;
    if (step.state === "active") {
      row.setAttribute("aria-current", "step");
    } else {
      row.removeAttribute("aria-current");
    }

    if (step.state === "waiting") {
      detail.textContent = "Waiting";
    } else if (step.state === "done") {
      detail.textContent =
        `Done in ${formatStepDuration(step.durationSeconds)}`;
    } else if (step.state === "cancelled") {
      detail.textContent =
        `Cancelled after ${formatStepDuration(step.durationSeconds)}`;
    } else if (step.state === "failed") {
      detail.textContent =
        `Stopped after ${formatStepDuration(step.durationSeconds)}`;
    } else if (step.id !== "process") {
      detail.textContent =
        `${processingStepAction} · ${formatStepDuration(
          step.elapsedSeconds,
        )} elapsed`;
    } else {
      const frameProgress = estimate?.progress ?? 0;
      const elapsed = formatStepDuration(step.elapsedSeconds);
      const hasDuration =
        Number.isFinite(processingSegmentDuration) &&
        processingSegmentDuration > 0;
      const processedTime = hasDuration
        ? formatTime(frameProgress * processingSegmentDuration)
        : undefined;
      const totalTime = hasDuration
        ? formatTime(processingSegmentDuration)
        : undefined;
      const processedLabel = hasDuration
        ? `Processed ${processedTime} / ${totalTime}`
        : "Processing video frames";

      if (frameProgress >= 1) {
        detail.textContent =
          `All frames processed · Elapsed: ${elapsed} · ` +
          "Finishing encoder";
      } else if (
        frameProgress >= PROCESSING_LAST_FRAMES_THRESHOLD
      ) {
        detail.textContent =
          `${processedLabel} · Elapsed: ${elapsed} · ` +
          "Finishing the last frames";
      } else if (
        estimate?.remainingSeconds !== undefined &&
        silentSeconds < PROCESSING_PROGRESS_SILENCE_SECONDS
      ) {
        detail.textContent =
          `${processedLabel} · Elapsed: ${elapsed} · ` +
          `ETA: about ${formatEstimatedTime(
            estimate.remainingSeconds,
          )}`;
      } else if (
        silentSeconds >= PROCESSING_PROGRESS_SILENCE_SECONDS
      ) {
        detail.textContent =
          `${processedLabel} · Elapsed: ${elapsed} · ` +
          "ETA: waiting for new frame progress";
      } else {
        detail.textContent =
          `${processedLabel} · Elapsed: ${elapsed} · ` +
          "ETA: calculating from the first frames";
      }
    }
  }
}

function updateProcessingWaitMessage() {
  renderProcessingSteps();
}

function updateEngineProgress(progress) {
  if (!Number.isFinite(progress)) {
    return;
  }

  if (activeProcessingStepId && activeProcessingStepId !== "process") {
    return;
  }

  if (
    processingEstimateStartedAt === undefined ||
    !processingTimeEstimator
  ) {
    elements.progress.value = clamp(progress, 0, 1);
    return;
  }

  updateProcessingProgress(progress);
}

function updateProcessingProgress(progress) {
  if (!Number.isFinite(progress)) {
    return;
  }

  const normalizedProgress = clamp(progress, 0, 1);
  if (
    processingEstimateStartedAt === undefined ||
    !processingTimeEstimator
  ) {
    elements.progress.value = normalizedProgress;
    return;
  }

  const elapsedSeconds =
    (performance.now() - processingEstimateStartedAt) / 1000;
  const previousProgress =
    processingTimeEstimator.snapshot().progress;
  const estimate = processingTimeEstimator.update(
    normalizedProgress,
    elapsedSeconds,
  );
  if (estimate.progress > previousProgress) {
    lastProcessingProgressAt = performance.now();
  }
  if (estimate.progress >= 1) {
    elements.progress.removeAttribute("value");
    elements.progress.setAttribute(
      "aria-valuetext",
      "All frames processed; finishing encoder",
    );
  } else {
    elements.progress.value = estimate.progress;
    if (
      Number.isFinite(processingSegmentDuration) &&
      processingSegmentDuration > 0
    ) {
      elements.progress.setAttribute(
        "aria-valuetext",
        `${formatTime(
          estimate.progress * processingSegmentDuration,
        )} of ${formatTime(processingSegmentDuration)} processed`,
      );
    }
  }
  syncOutputPreviewToProcessing(estimate.progress);
  renderProcessingSteps();
}

async function loadFFmpeg() {
  if (ffmpeg?.loaded) {
    if (!decoderNames) {
      await loadDecoderCapabilities(ffmpeg);
    }
    return ffmpeg;
  }

  if (activeProcessingStepId) {
    setProcessingStepAction("Loading video tools");
  } else {
    setStatus("Loading the local video tools…", true, true);
  }
  ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    updateEngineProgress(progress);
  });
  ffmpeg.on("log", ({ message }) => {
    if (activeProcessingStepId === "process") {
      const logProgress = progressFromProcessingLog(
        message,
        processingSegmentDuration,
      );
      if (logProgress !== undefined) {
        updateProcessingProgress(logProgress);
      }
    }
    activeLogSink?.(message);
  });

  await ffmpeg.load({ classWorkerURL, coreURL, wasmURL });
  await loadDecoderCapabilities(ffmpeg);
  return ffmpeg;
}

async function loadDecoderCapabilities(engine) {
  const logLines = [];
  activeLogSink = (message) => logLines.push(message);

  try {
    await engine.exec(["-hide_banner", "-decoders"]);
    decoderNames = parseDecoderList(logLines);
  } finally {
    activeLogSink = undefined;
  }
}

async function prepareInput(engine, revision) {
  if (requiresStreamingInput(selectedFile?.size)) {
    throw new Error(
      "Large video files must use the streaming input path.",
    );
  }

  if (preparedRevision === revision && preparedInputName) {
    return preparedInputName;
  }

  if (preparedInputName) {
    await engine.deleteFile(preparedInputName).catch(() => {});
    preparedInputName = undefined;
    preparedRevision = -1;
  }

  const inputName = `input-${revision}.media`;
  if (activeProcessingStepId) {
    setProcessingStepAction("Copying the source into the editor");
  } else {
    setStatus("Preparing the video in your browser…", true);
  }
  await engine.writeFile(
    inputName,
    new Uint8Array(await selectedFile.arrayBuffer()),
  );

  if (revision !== sourceRevision) {
    await engine.deleteFile(inputName).catch(() => {});
    throw new Error("A different video was selected.");
  }

  preparedInputName = inputName;
  preparedRevision = revision;
  return inputName;
}

function configureSelection() {
  if (!Number.isFinite(duration) || duration <= 0) {
    return false;
  }

  for (const control of [elements.startTime, elements.endTime]) {
    control.max = String(duration);
  }
  for (const control of [elements.startRange, elements.endRange]) {
    control.max = String(duration);
  }

  if (elements.selectionPanel.hidden) {
    setTime("start", 0);
    setTime("end", duration);
  }

  updateMode();
  elements.selectionPanel.hidden = false;
  elements.outputOptionsPanel.hidden = false;
  return true;
}

function updateFormatSummary() {
  if (!mediaInfo) {
    elements.formatSummary.hidden = true;
    elements.reencodeSuggestion.hidden = true;
    elements.reencodeCopyStatus.textContent = "";
    return;
  }

  const warning = mediaCompatibilityWarning({
    readable: mediaInfo.readable,
    canReencode: mediaInfo.canReencode,
    browserPreviewReadable,
    invalidSeekIndex: mediaInfo.invalidSeekIndex,
  });
  elements.formatSummary.textContent = warning;
  elements.formatSummary.classList.toggle("warning", Boolean(warning));
  elements.formatSummary.hidden = !warning;
  const suggestReencode = Boolean(
    selectedFile &&
      (mediaInfo.invalidSeekIndex ||
        !mediaInfo.readable ||
        !mediaInfo.canReencode),
  );
  elements.reencodeCommand.textContent = suggestReencode
    ? ffmpegReencodeCommand(selectedFile.name)
    : "";
  elements.reencodeSuggestion.hidden = !suggestReencode;
  elements.reencodeCopyStatus.textContent = "";
}

async function copyReencodeCommand() {
  const command = elements.reencodeCommand.textContent.trim();
  if (!command) {
    return;
  }

  clearTimeout(reencodeCopyStatusTimer);
  try {
    await navigator.clipboard.writeText(command);
    elements.reencodeCopyStatus.textContent = "Copied";
  } catch {
    elements.reencodeCopyStatus.textContent =
      "Could not copy. Select the command manually.";
  }
  reencodeCopyStatusTimer = setTimeout(() => {
    elements.reencodeCopyStatus.textContent = "";
  }, 2000);
}

async function detectStreamingKeyframes(revision) {
  updateVideoPreparationMessage(
    revision,
    "Reading video details…",
  );
  setStatus("Reading video details…", true, true);

  const analysis = await analyzeStreamingMedia(selectedFile, {
    isCancelled: () =>
      cancelRequested || revision !== sourceRevision,
    onKeyframe: (_timestamp, mediaDuration) => {
      updateVideoPreparationMessage(
        revision,
        Number.isFinite(mediaDuration)
          ? "Finding keyframes…"
          : "Reading keyframe details…",
      );
    },
  });

  if (revision !== sourceRevision) {
    return;
  }

  if (
    analysis.keyframeIndexReliable === false &&
    analysis.verifiedKeyframePrefixLength > 0 &&
    analysis.containerNames.includes("mp4")
  ) {
    mediaInfo = {
      ...analysis,
      canReencode: false,
      webCodecsEditing: false,
      outputContainer: selectStreamCopyContainer(
        analysis,
        selectedFile.name,
      ),
      readable: true,
      streamingInput: true,
      invalidSeekIndex: true,
    };
    resetKeyframes();
    elements.videoPanel.hidden = true;
    elements.selectionPanel.hidden = true;
    elements.outputOptionsPanel.hidden = true;
    elements.outputPreviewPanel.hidden = true;
    elements.resultPanel.hidden = true;
    updateFormatSummary();
    return;
  }

  duration =
    Number.isFinite(duration) && duration > 0
      ? duration
      : analysis.duration ?? 0;
  sourceWidth ||= analysis.width ?? 0;
  sourceHeight ||= analysis.height ?? 0;

  let webCodecsEditing = false;
  if (analysis.readable && sourceWidth && sourceHeight) {
    updateVideoPreparationMessage(
      revision,
      "Checking the available editing options…",
    );
    const webCodecsEditor = await loadWebCodecsEditor();
    webCodecsEditing = await webCodecsEditor.canEditWithWebCodecs(
      selectedFile,
      {
        sourceWidth,
        sourceHeight,
        cropSize: centeredVerticalSize(sourceWidth, sourceHeight),
      },
    );
  }

  const outputContainer = selectStreamCopyContainer(
    analysis,
    selectedFile.name,
  );
  mediaInfo = {
    ...analysis,
    canReencode: webCodecsEditing,
    webCodecsEditing,
    outputContainer,
    readable: analysis.readable && webCodecsEditing,
    streamingInput: true,
  };

  if (!mediaInfo.readable) {
    resetKeyframes();
    updateFormatSummary();
    elements.resultPanel.hidden = true;
    return;
  }

  if (!configureSelection()) {
    mediaInfo.readable = false;
    updateFormatSummary();
    elements.resultPanel.hidden = true;
    return;
  }

  keyframes = analysis.keyframes;
  renderKeyframeMarks();
  renderPreviewFrameIndicator();
  renderSavedSubjectBox();
  renderTrackingConfidenceTimeline();
  updateFormatSummary();
  elements.keyframeSummary.textContent = keyframes.length
    ? ""
    : "Keyframes could not be found. Exact cutting still works.";
  elements.keyframeSummary.hidden = keyframes.length > 0;
  elements.resultPanel.hidden = true;
}

async function detectKeyframes(revision) {
  if (!selectedFile || revision !== sourceRevision) {
    return;
  }

  cancelRequested = false;
  setBusy(true);
  elements.progress.value = 0;
  const reportName = `keyframes-${revision}.txt`;
  let decodeProbeFailed = false;
  let engine;

  try {
    const loadingStrategy = mediaLoadingStrategy(selectedFile.size);
    if (loadingStrategy === MEDIA_LOADING_STRATEGY.STREAMING) {
      await detectStreamingKeyframes(revision);
      return;
    }

    // Ordinary files retain the complete in-memory FFmpeg workflow.
    updateVideoPreparationMessage(
      revision,
      "Loading the local video tools…",
    );
    engine = await loadFFmpeg();
    const inputName = await prepareInput(engine, revision);
    updateVideoPreparationMessage(
      revision,
      "Finding keyframes. Large files can take a moment…",
    );
    setStatus("Preparing fast cut points…", true);
    const probeLogs = [];
    activeLogSink = (message) => probeLogs.push(message);

    const exitCode = await engine.exec(
      createKeyframeScanArgs(inputName, reportName),
    );
    activeLogSink = undefined;

    if (revision !== sourceRevision) {
      return;
    }

    const probe = parseMediaProbeLogs(probeLogs);
    const support = decoderSupport(probe, decoderNames ?? new Set());
    let canReencode =
      support.canReencode && probe.videoCodec !== "av1";

    if (canReencode) {
      updateVideoPreparationMessage(
        revision,
        "Checking the available editing options…",
      );
      setStatus("Checking editing options…", true, true);
      activeLogSink = () => {};
      canReencode =
        (await engine.exec(createDecodeProbeArgs(inputName))) === 0;
      decodeProbeFailed = !canReencode;
      activeLogSink = undefined;
    }

    let webCodecsEditing = false;
    if (!canReencode) {
      setStatus("Checking editing options…", true, true);
      const webCodecsEditor = await loadWebCodecsEditor();
      const fallbackCropSize = centeredVerticalSize(
        sourceWidth || probe.width,
        sourceHeight || probe.height,
      );
      webCodecsEditing = await webCodecsEditor.canEditWithWebCodecs(
        selectedFile,
        {
          sourceWidth: sourceWidth || probe.width,
          sourceHeight: sourceHeight || probe.height,
          cropSize: fallbackCropSize,
        },
      );
    }

    const outputContainer = selectStreamCopyContainer(
      probe,
      selectedFile.name,
    );
    mediaInfo = {
      ...probe,
      ...support,
      canReencode: canReencode || webCodecsEditing,
      webCodecsEditing,
      outputContainer,
      readable: exitCode === 0 && Boolean(probe.videoCodec),
    };

    if (!mediaInfo.readable) {
      resetKeyframes();
      updateFormatSummary();
      elements.resultPanel.hidden = true;
      return;
    }

    if (!mediaInfo.canReencode) {
      elements.verticalMode.checked = false;
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      duration = mediaInfo.duration ?? 0;
    }
    sourceWidth ||= mediaInfo.width ?? 0;
    sourceHeight ||= mediaInfo.height ?? 0;

    if (!configureSelection()) {
      mediaInfo.readable = false;
      updateFormatSummary();
      elements.resultPanel.hidden = true;
      return;
    }

    const reportData = await engine.readFile(reportName);
    const report = new TextDecoder().decode(reportData);
    keyframes = parseFramecrcKeyframes(report, duration);

    renderKeyframeMarks();
    renderPreviewFrameIndicator();
    renderSavedSubjectBox();
    renderTrackingConfidenceTimeline();
    updateFormatSummary();
    elements.keyframeSummary.textContent = keyframes.length
      ? ""
      : "Fast cut points could not be found. Cutting still works, but the timing may shift slightly.";
    elements.keyframeSummary.hidden = keyframes.length > 0;
    elements.resultPanel.hidden = true;

    if (decodeProbeFailed) {
      resetFFmpegEngine();
      engine = undefined;
    }
  } catch (error) {
    if (revision === sourceRevision) {
      if (cancelRequested) {
        setStatus("Video preparation cancelled.");
        return;
      }
      console.error(error);
      mediaInfo = {
        readable: false,
        outputContainer: selectStreamCopyContainer(
          { containerNames: [] },
          selectedFile.name,
        ),
      };
      updateFormatSummary();
      elements.keyframeSummary.textContent = "";
      elements.keyframeSummary.hidden = true;
      elements.resultPanel.hidden = true;
    }
  } finally {
    activeLogSink = undefined;
    if (engine?.loaded) {
      await engine.deleteFile(reportName).catch(() => {});
    }
    if (revision === sourceRevision) {
      keyframePreparationComplete = true;
      setBusy(false);
      updateSelectionSummary();
      finishVideoPreparation(revision);
    }
  }
}

async function cutVideo() {
  if (!selectedFile || !updateSelectionSummary()) {
    return;
  }

  if (
    mediaInfo?.streamingInput &&
    !mediaInfo.webCodecsEditing
  ) {
    setStatus(
      "This browser cannot edit this large video's format. Try opening it in Chrome or export the source as an H.264 MP4.",
      false,
      false,
      true,
    );
    return;
  }

  resetDownload();
  cancelRequested = false;
  setBusy(true);
  elements.progress.value = 0;

  const { start, end } = selection();
  const segmentDuration = end - start;
  const revision = sourceRevision;
  const vertical = elements.verticalMode.checked;
  const videoSpeed = selectedVideoSpeed();
  const speedChanged = videoSpeed !== 1;
  const keepAudio = elements.keepAudio.checked && !speedChanged;
  const exactCut =
    mediaInfo?.streamingInput ||
    vertical ||
    speedChanged ||
    !elements.snapKeyframes.checked;
  const reencoding = exactCut;
  const useWebCodecs =
    reencoding && mediaInfo.webCodecsEditing;
  const outputContainer = reencoding
    ? { extension: "mp4", label: "MP4", mimeType: "video/mp4" }
    : mediaInfo.outputContainer;
  const outputName = `cut-${revision}.${outputContainer.extension}`;
  const cropSize = centeredVerticalSize(sourceWidth, sourceHeight);
  const cropTrajectory = vertical
    ? createCropTrajectory(subjectReferences, {
        start,
        end,
        sourceWidth,
        sourceHeight,
        cropSize,
      })
    : undefined;
  const subjectGuided = vertical && subjectReferences.length > 0;
  const operationLogs = [];
  const processingMessage = vertical
    ? subjectGuided
      ? "Tracking the subject and creating the vertical video…"
      : "Creating the centered vertical video…"
    : speedChanged
      ? `Creating the video at ${Number(videoSpeed.toFixed(2))}× speed…`
      : exactCut
      ? "Creating an exact cut…"
      : "Cutting the video…";
  const processingStepLabel = vertical
    ? subjectGuided
      ? "Cut the clip, crop to 9:16, and track the subject"
      : "Cut the clip and crop the center to 9:16"
    : speedChanged
      ? `Cut the clip and change its speed to ${Number(videoSpeed.toFixed(2))}×`
      : exactCut
      ? "Cut the clip at the exact selected times"
      : "Cut the clip without changing its quality";
  let engine;
  startProcessingEstimate(
    processingMessage,
    processingStepLabel,
    segmentDuration,
  );

  try {
    let data;
    if (useWebCodecs) {
      isUsingWebCodecs = true;
      const webCodecsEditor = await loadWebCodecsEditor();
      const browserOutput =
        await webCodecsEditor.cutWithWebCodecs(selectedFile, {
          start,
          end,
          vertical,
          sourceWidth,
          sourceHeight,
          cropSize,
          cropTrajectory,
          keepAudio,
          playbackRate: videoSpeed,
          diskBacked: mediaInfo.streamingInput,
          onProgress: (progress) => {
            updateEngineProgress(progress);
          },
          onConversion: (conversion) => {
            activeWebConversion = conversion;
            if (conversion && cancelRequested) {
              void conversion.cancel();
            }
          },
          onPhase: (phase) => {
            if (phase === "preparing") {
              setProcessingStepAction("Preparing the source");
            } else if (phase === "processing") {
              startProcessingStep(
                "process",
                vertical
                  ? subjectGuided
                    ? "Cropping each frame around the subject"
                    : "Cropping the center of each frame"
                  : "Cutting at the selected times",
              );
            } else if (phase === "finalizing") {
              startProcessingStep(
                "finalize",
                "Writing the finished video file",
              );
            }
          },
        });
      data = browserOutput.data;
      downloadCleanup = browserOutput.cleanup;
    } else {
      engine = await loadFFmpeg();
      const inputName = await prepareInput(engine, revision);
      startProcessingStep(
        "process",
        exactCut
          ? vertical
            ? subjectGuided
              ? "Cropping each frame around the subject"
              : "Cropping the center of each frame"
            : "Cutting at the selected times"
          : "Copying the selected clip without changing quality",
      );
      activeLogSink = (message) => {
        operationLogs.push(message.slice(-500));
        if (operationLogs.length > 40) {
          operationLogs.shift();
        }
      };

      const exitCode = await engine.exec(
        createCutArgs({
          inputName,
          outputName,
          start,
          end,
          vertical,
          cropSize,
          cropTrajectory,
          accurate: exactCut,
          keepAudio,
          playbackRate: videoSpeed,
        }),
      );

      if (exitCode !== 0) {
        const details = operationLogs.slice(-12).join("\n");
        throw new Error(
          `FFmpeg stopped with exit code ${exitCode}.${details ? `\n${details}` : ""}`,
        );
      }

      updateProcessingProgress(1);
      startProcessingStep(
        "finalize",
        "Writing the finished video file",
      );
      data = await engine.readFile(outputName);
    }

    const blob =
      data instanceof Blob
        ? data
        : new Blob(
            [data instanceof Uint8Array ? data.buffer : data],
            { type: outputContainer.mimeType },
          );
    downloadURL = URL.createObjectURL(blob);
    elements.downloadLink.href = downloadURL;
    const outputFilename = defaultOutputFilename(selectedFile.name, {
      vertical,
      extension: outputContainer.extension,
    });
    elements.outputFilename.value = outputFilename;
    elements.outputFilename.placeholder = outputFilename;
    elements.downloadLink.download = outputFilename;
    setLabeledControl(
      elements.downloadLink,
      `Download (${formatBytes(blob.size)})`,
      "download",
    );
    elements.downloadControls.hidden = false;
    elements.downloadLink.hidden = false;
    completeProcessingSteps();
    setStatus(
      vertical
        ? `Finished locally. Your ${formatTime(segmentDuration / videoSpeed)} vertical clip is ready at ${cropSize.width} × ${cropSize.height}.`
        : `Finished locally. Your ${formatTime(segmentDuration / videoSpeed)} clip is ready.`,
    );
  } catch (error) {
    if (cancelRequested) {
      stopProcessingSteps("cancelled");
      setStatus("Cut cancelled.");
    } else {
      stopProcessingSteps("failed");
      console.error(error);
      setStatus(
        processingFailureMessage(error, {
          browserEncoding: useWebCodecs,
          vertical,
        }),
        false,
        false,
        true,
      );
    }
  } finally {
    stopProcessingEstimate();
    activeWebConversion = undefined;
    isUsingWebCodecs = false;
    activeLogSink = undefined;
    if (engine?.loaded) {
      await engine.deleteFile(outputName).catch(() => {});
    }
    setBusy(false);
  }
}

function loadVideo(file) {
  sourceRevision += 1;
  dismissSubjectOnboarding();
  releaseLoadedVideo();
  selectedFile = file;
  stopProcessingEstimate();
  processingStepTracker = undefined;
  activeProcessingStepId = undefined;
  elements.processingSteps.hidden = true;
  trackingSpeedRecommendationApplied = false;
  duration = 0;
  sourceWidth = 0;
  sourceHeight = 0;
  mediaInfo = undefined;
  preferredKeepAudio = true;
  elements.keepAudio.checked = true;
  elements.videoSpeed.value = "1";
  elements.videoSpeedValue.textContent = "1×";
  elements.outputPreviewMedia.playbackRate = 1;
  browserPreviewReadable = undefined;
  previewMetadataReady = false;
  keyframePreparationComplete = false;
  elements.previewFrameIndicator.hidden = true;
  elements.outputPreviewFrameIndicator.hidden = true;
  resetKeyframes();
  resetDownload();
  clearSubjectSelection(false);

  previewURL = URL.createObjectURL(file);
  elements.preview.src = previewURL;
  elements.outputPreviewMedia.src = previewURL;
  elements.outputPreviewMedia.load();
  elements.videoPanel.hidden = false;
  elements.previewStage.hidden = false;
  setVideoPreparationState(
    true,
    "Loading video details and keyframes. Large files can take a moment…",
  );
  elements.frameStepControls.hidden = true;
  elements.subjectPicker.hidden = true;
  elements.selectionPanel.hidden = true;
  elements.outputOptionsPanel.hidden = true;
  elements.fileDetails.textContent = `${file.name} · ${formatBytes(file.size)}`;
  elements.formatSummary.hidden = true;
  elements.formatSummary.classList.remove("warning");
  elements.reencodeSuggestion.hidden = true;
  elements.reencodeCommand.textContent = "";
  elements.reencodeCopyStatus.textContent = "";
  setStatus("Preparing the video…", true, true);
  void detectKeyframes(sourceRevision);
}

function finishPendingVideoReplacement() {
  const file = pendingReplacementFile;
  const replace = elements.replaceVideoDialog.returnValue === "replace";
  pendingReplacementFile = undefined;

  if (replace && file) {
    loadVideo(file);
    return;
  }

  elements.fileInput.value = "";
}

elements.fileInput.addEventListener("change", () => {
  const [file] = elements.fileInput.files;
  if (!file) {
    return;
  }

  if (subjectReferences.length > 0) {
    pendingReplacementFile = file;
    elements.replaceVideoDialog.returnValue = "";
    elements.replaceVideoDialog.showModal();
    return;
  }

  loadVideo(file);
});

elements.preview.addEventListener("loadeddata", () => {
  previewPresentedTime = undefined;
  scheduleCropPreviewFrame(true);
  if (elements.preview.currentTime <= 0 && elements.preview.duration > 0) {
    elements.preview.currentTime = Math.min(
      0.001,
      elements.preview.duration,
    );
  }
});
elements.preview.addEventListener("loadedmetadata", () => {
  browserPreviewReadable = true;
  previewMetadataReady = true;
  duration = elements.preview.duration;
  sourceWidth = elements.preview.videoWidth;
  sourceHeight = elements.preview.videoHeight;
  if (mediaInfo?.invalidSeekIndex) {
    elements.videoPanel.hidden = true;
    elements.frameStepControls.hidden = true;
    elements.subjectPicker.hidden = true;
    elements.selectionPanel.hidden = true;
    elements.outputOptionsPanel.hidden = true;
    elements.outputPreviewPanel.hidden = true;
    finishVideoPreparation(sourceRevision);
    return;
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    duration = 0;
    return;
  }

  elements.subjectPicker.hidden = false;
  elements.frameStepControls.hidden = false;
  elements.outputPreviewPanel.hidden = false;
  renderPreviewFrameIndicator();
  updateSubjectSurfaceRect();
  updateSubjectSummary();
  configureSelection();
  updateFormatSummary();
  finishVideoPreparation(sourceRevision);
});

elements.preview.addEventListener("error", () => {
  browserPreviewReadable = false;
  previewMetadataReady = true;
  setVideoPreparationState(false);
  elements.videoPanel.hidden = true;
  elements.previewStage.hidden = true;
  elements.frameStepControls.hidden = true;
  elements.subjectPicker.hidden = true;
  elements.outputOptionsPanel.hidden = true;
  elements.outputPreviewPanel.hidden = true;
  updateMode();
  updateFormatSummary();
  if (!isRunning) {
    elements.resultPanel.hidden = true;
  }
});
elements.preview.addEventListener("timeupdate", () => {
  updatePlayheadButtons();
  updateFrameStepControls();
  renderCropPreview();
  renderSavedSubjectBox();
  renderPreviewFrameIndicator();
  renderTrackingConfidencePlayhead();
});
elements.preview.addEventListener("seeking", () => {
  previewPresentedTime = undefined;
  scheduleCropPreviewFrame(true);
});
elements.preview.addEventListener("play", () => {
  dismissSubjectOnboarding();
  pauseOutputPreview();
  scheduleCropPreviewFrame();
});
elements.preview.addEventListener("pause", () => {
  stopCropPreviewAnimation();
  renderCropPreview();
  renderSavedSubjectBox();
  renderPreviewFrameIndicator();
  renderTrackingConfidencePlayhead();
});
elements.preview.addEventListener("seeked", () => {
  scheduleCropPreviewFrame(true);
  renderSavedSubjectBox();
  renderPreviewFrameIndicator();
  renderTrackingConfidencePlayhead();
});
elements.preview.addEventListener("ended", stopCropPreviewAnimation);
elements.outputPreviewMedia.addEventListener("loadeddata", () => {
  outputPreviewReady = true;
  outputPreviewFramePresented = false;
  outputPreviewPresentedTime = undefined;
  elements.outputPreviewNote.textContent = PREVIEW_NOTE_WITH_AUDIO;
  if (
    elements.outputPreviewMedia.currentTime <= 0 &&
    elements.outputPreviewMedia.duration > 0
  ) {
    setOutputPreviewMediaTime(
      Math.min(0.001, elements.outputPreviewMedia.duration),
    );
    return;
  }
  scheduleOutputPreviewStillFrame();
});
elements.outputPreviewMedia.addEventListener("seeked", () => {
  outputPreviewPendingSeek = undefined;
  outputPreviewFramePresented = false;
  outputPreviewPresentedTime = undefined;
  scheduleOutputPreviewStillFrame();
});
elements.outputPreviewMedia.addEventListener("timeupdate", () => {
  const { end } = selection();
  if (
    !elements.outputPreviewMedia.paused &&
    elements.outputPreviewMedia.currentTime >= end - 0.005
  ) {
    finishOutputPreview();
  } else if (!outputPreviewFramePresented) {
    scheduleOutputPreviewStillFrame();
  } else {
    drawOutputPreviewFrame();
  }
});
elements.outputPreviewMedia.addEventListener("pause", () => {
  stopOutputPreviewFrame();
  updateOutputPreviewControls();
});
elements.outputPreviewMedia.addEventListener(
  "ended",
  finishOutputPreview,
);
elements.outputPreviewMedia.addEventListener("error", () => {
  outputPreviewReady = false;
  elements.outputPreviewNote.textContent =
    "A visual preview is not available for this video, but you can still create it.";
  updateOutputPreviewControls();
});

elements.startTime.addEventListener("input", () =>
  setTime("start", elements.startTime.value, true),
);
elements.startTime.addEventListener("change", () =>
  setTime("start", elements.startTime.value, true, true),
);
elements.endTime.addEventListener("input", () =>
  setTime("end", elements.endTime.value, true),
);
elements.endTime.addEventListener("change", () =>
  setTime("end", elements.endTime.value, true, true),
);
elements.startRange.addEventListener("input", () =>
  setTime("start", elements.startRange.value, true, true),
);
elements.endRange.addEventListener("input", () =>
  setTime("end", elements.endRange.value, true, true),
);
elements.snapKeyframes.addEventListener("change", updateMode);
elements.verticalMode.addEventListener("change", () => {
  updateMode();
  refreshOutputPreview();
});
elements.keepAudio.addEventListener("change", () => {
  preferredKeepAudio = elements.keepAudio.checked;
  syncOutputPreviewAudio();
  updateSelectionSummary();
});
elements.videoSpeed.addEventListener("input", updateVideoSpeed);
elements.copyReencodeCommand.addEventListener(
  "click",
  copyReencodeCommand,
);
elements.setStart.addEventListener("click", () =>
  setTime("start", elements.preview.currentTime, false, true),
);
elements.setEnd.addEventListener("click", () =>
  setTime("end", elements.preview.currentTime, false, true),
);
elements.clearSubject.addEventListener(
  "click",
  requestClearSubjectSelection,
);
elements.followSubject.addEventListener("click", () => {
  void followSubjectForward();
});
elements.stopFollowing.addEventListener(
  "click",
  stopFollowingSubject,
);
elements.trackingConfidenceCanvas.addEventListener(
  "click",
  (event) => {
    reviewTrackingConfidencePoint(
      confidencePointFromClientX(event.clientX),
    );
  },
);
elements.trackingConfidenceCanvas.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }

    event.preventDefault();
    if (trackingConfidencePoints.length === 0) {
      return;
    }
    const nearest = nearestTrackingConfidencePoint(
      trackingConfidencePoints,
      elements.preview.currentTime,
    );
    const currentIndex = Math.max(
      0,
      trackingConfidencePoints.indexOf(nearest),
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? trackingConfidencePoints.length - 1
          : clamp(
              currentIndex + (event.key === "ArrowLeft" ? -1 : 1),
              0,
              trackingConfidencePoints.length - 1,
            );
    reviewTrackingConfidencePoint(
      trackingConfidencePoints[nextIndex],
    );
  },
);
elements.laterSubjectDialog.addEventListener(
  "close",
  finishPendingSubjectSave,
);
elements.clearSubjectDialog.addEventListener(
  "close",
  finishClearSubjectSelection,
);
elements.replaceVideoDialog.addEventListener(
  "close",
  finishPendingVideoReplacement,
);
elements.laterSubjectDialog.addEventListener(
  "cancel",
  cancelPendingSubjectSave,
);
elements.confirmSubject.addEventListener(
  "click",
  confirmSubjectSelection,
);
elements.cancelSubject.addEventListener(
  "click",
  cancelSubjectSelection,
);
elements.subjectSurface.addEventListener(
  "pointerdown",
  beginSubjectPointerInteraction,
);
elements.subjectSurface.addEventListener(
  "pointermove",
  updateSubjectPointerInteraction,
);
elements.subjectSurface.addEventListener(
  "pointerup",
  finishSubjectPointerInteraction,
);
elements.subjectSurface.addEventListener(
  "pointercancel",
  finishSubjectPointerInteraction,
);
elements.preview.addEventListener(
  "pointerdown",
  beginPreviewSubjectGesture,
);
elements.preview.addEventListener(
  "click",
  handlePreviewClick,
  true,
);
elements.preview.addEventListener(
  "play",
  handlePreviewPlaybackStart,
);
window.addEventListener(
  "pointermove",
  updatePreviewSubjectGesture,
);
window.addEventListener(
  "pointerup",
  finishPreviewSubjectGesture,
);
window.addEventListener(
  "pointercancel",
  finishPreviewSubjectGesture,
);
window.addEventListener(
  "keydown",
  handlePreviewKeyboardShortcut,
  true,
);
elements.outputPreviewToggle.addEventListener(
  "click",
  toggleOutputPreview,
);
elements.outputPreviewSeek.addEventListener("input", () => {
  seekOutputPreview(Number(elements.outputPreviewSeek.value));
});
elements.outputPreviewSeek.addEventListener("pointerdown", (event) => {
  if (elements.outputPreviewSeek.disabled) {
    return;
  }
  outputPreviewDraggingPointer = event.pointerId;
  seekOutputPreviewFromPointer(event);
});
window.addEventListener("pointermove", (event) => {
  if (outputPreviewDraggingPointer !== event.pointerId) {
    return;
  }
  seekOutputPreviewFromPointer(event);
});
window.addEventListener("pointerup", (event) => {
  if (outputPreviewDraggingPointer === event.pointerId) {
    outputPreviewDraggingPointer = undefined;
  }
});
window.addEventListener("pointercancel", (event) => {
  if (outputPreviewDraggingPointer === event.pointerId) {
    outputPreviewDraggingPointer = undefined;
  }
});
elements.cutButton.addEventListener("click", cutVideo);
elements.outputFilename.addEventListener(
  "input",
  updateDownloadFilename,
);
elements.outputFilename.addEventListener("blur", () => {
  if (!elements.outputFilename.value.trim()) {
    elements.outputFilename.value = elements.outputFilename.placeholder;
  }
  updateDownloadFilename();
});
elements.cancelButton.addEventListener("click", () => {
  if (!isRunning) {
    return;
  }
  cancelRequested = true;
  stopProcessingSteps("cancelled");
  stopProcessingEstimate();
  if (isUsingWebCodecs) {
    void activeWebConversion?.cancel();
    return;
  }
  if (!ffmpeg) {
    return;
  }
  resetFFmpegEngine();
});

if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(updateSubjectSurfaceRect).observe(elements.preview);
  new ResizeObserver(renderTrackingConfidenceTimeline).observe(
    elements.trackingConfidence,
  );
} else {
  window.addEventListener("resize", updateSubjectSurfaceRect);
  window.addEventListener("resize", renderTrackingConfidenceTimeline);
}

window.addEventListener("beforeunload", (event) => {
  if (subjectReferences.length === 0) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("pagehide", () => {
  stopTrackingRequested = true;
  stopCropPreviewAnimation();
  stopOutputPreviewFrame();
  stopOutputPreviewStillFrame();
  elements.outputPreviewMedia.pause();
  if (previewURL) URL.revokeObjectURL(previewURL);
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  void activeWebConversion?.cancel();
  ffmpeg?.terminate();
});
