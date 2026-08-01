import {
  ArrowRight,
  Copy,
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  PawPrint,
  Pause,
  Play,
  RotateCcw,
  Save,
  ScanSearch,
  Square,
  Trash2,
  X,
  createElement as createLucideIcon,
} from "lucide";
import { isGoogleChrome } from "./browser-support.js";

const ICONS = {
  arrowRight: ArrowRight,
  brand: PawPrint,
  close: X,
  copy: Copy,
  download: Download,
  external: ExternalLink,
  info: Info,
  loading: LoaderCircle,
  pause: Pause,
  play: Play,
  replay: RotateCcw,
  reset: RotateCcw,
  save: Save,
  stop: Square,
  track: ScanSearch,
  trash: Trash2,
};

function requiredElement(selector, root = document) {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Required UI element not found: ${selector}`);
  }
  return element;
}

function icon(name, size = 18) {
  const iconDefinition = ICONS[name];
  if (!iconDefinition) {
    throw new Error(`Unknown UI icon: ${name}`);
  }
  return createLucideIcon(iconDefinition, {
    "aria-hidden": "true",
    class: "ui-icon",
    width: size,
    height: size,
  });
}

export function setLabeledControl(control, label, iconName) {
  control.replaceChildren(
    icon(iconName),
    document.createTextNode(label),
  );
}

export function setIconOnlyControl(control, iconName) {
  control.replaceChildren(icon(iconName));
}

export function collectUiElements(root = document) {
  const get = (selector) => requiredElement(selector, root);

  return {
    brandMark: get("#brand-mark"),
    browserGate: get("#browser-gate"),
    mobileWarning: get("#mobile-warning"),
    fileInput: get("#file-input"),
    fileDetails: get("#file-details"),
    formatSummary: get("#format-summary"),
    reencodeSuggestion: get("#reencode-suggestion"),
    reencodeCommand: get("#reencode-command"),
    copyReencodeCommand: get("#copy-reencode-command"),
    reencodeCopyStatus: get("#reencode-copy-status"),
    ffmpegDownloadLink: get("#ffmpeg-download-link"),
    videoPanel: get("#video-panel"),
    videoFps: get("#video-fps"),
    previewStage: get("#preview-stage"),
    preview: get("#preview"),
    videoPreparationOverlay: get("#video-preparation-overlay"),
    videoPreparationMessage: get("#video-preparation-message"),
    frameStepControls: get("#frame-step-controls"),
    frameStepHelp: get("#frame-step-help"),
    cropPreview: get("#crop-preview"),
    previewFrameIndicator: get("#preview-frame-indicator"),
    subjectOverlay: get("#subject-overlay"),
    subjectInstruction: get("#subject-instruction"),
    subjectSurface: get("#subject-surface"),
    subjectBox: get("#subject-box"),
    savedSubjectBox: get("#saved-subject-box"),
    savedSubjectLabel: get("#saved-subject-label"),
    trackingBox: get("#tracking-box"),
    subjectPicker: get("#subject-picker"),
    subjectEditActions: get("#subject-edit-actions"),
    clearSubject: get("#clear-subject"),
    subjectTrackingActions: get("#subject-tracking-actions"),
    followSubject: get("#follow-subject"),
    stopFollowing: get("#stop-following"),
    trackingFrameSkip: get("#tracking-frame-skip"),
    speedTooltip: get(".tooltip-trigger"),
    trackingStatus: get("#tracking-status"),
    trackingStatusMessage: get("#tracking-status-message"),
    trackingStatusShortcut: get("#tracking-status-shortcut"),
    trackingConfidence: get("#tracking-confidence"),
    trackingConfidenceCanvas: get("#tracking-confidence-canvas"),
    trackingConfidencePlayhead: get("#tracking-confidence-playhead"),
    trackingConfidenceStart: get("#tracking-confidence-start"),
    trackingConfidenceEnd: get("#tracking-confidence-end"),
    confirmSubject: get("#confirm-subject"),
    cancelSubject: get("#cancel-subject"),
    subjectJumpRow: get("#subject-jump-row"),
    subjectJump: get("#subject-jump"),
    subjectReferences: get("#subject-references"),
    clearSubjectDialog: get("#clear-subject-dialog"),
    laterSubjectDialog: get("#later-subject-dialog"),
    laterSubjectDialogCopy: get("#later-subject-dialog-copy"),
    restartTrackingDialog: get("#restart-tracking-dialog"),
    selectionPanel: get("#selection-panel"),
    outputOptionsPanel: get("#output-options-panel"),
    startTime: get("#start-time"),
    endTime: get("#end-time"),
    startRange: get("#start-range"),
    endRange: get("#end-range"),
    startKeyframes: get("#start-keyframes"),
    endKeyframes: get("#end-keyframes"),
    setStart: get("#set-start"),
    setEnd: get("#set-end"),
    selectionSummary: get("#selection-summary"),
    keyframeSummary: get("#keyframe-summary"),
    snapKeyframes: get("#snap-keyframes"),
    cutModeHelp: get("#cut-mode-help"),
    verticalMode: get("#vertical-mode"),
    verticalHelp: get("#vertical-help"),
    keepAudio: get("#keep-audio"),
    audioHelp: get("#audio-help"),
    videoSpeed: get("#video-speed"),
    videoSpeedValue: get("#video-speed-value"),
    cropSummary: get("#crop-summary"),
    outputPreviewPanel: get("#output-preview-panel"),
    outputPreviewStage: get(".output-preview-stage"),
    outputPreviewMedia: get("#output-preview-media"),
    outputPreviewCanvas: get("#output-preview-canvas"),
    outputPreviewFrameIndicator: get("#output-preview-frame-indicator"),
    outputPreviewToggle: get("#output-preview-toggle"),
    outputPreviewSeek: get("#output-preview-seek"),
    outputPreviewTime: get("#output-preview-time"),
    outputPreviewNote: get("#output-preview-note"),
    cutButton: get("#cut-button"),
    cancelButton: get("#cancel-button"),
    resultPanel: get("#result-panel"),
    status: get("#status"),
    progress: get("#progress"),
    timeEstimate: get("#time-estimate"),
    processingSteps: get("#processing-steps"),
    processingStepRows: {
      prepare: get("#processing-step-prepare"),
      process: get("#processing-step-process"),
      finalize: get("#processing-step-finalize"),
    },
    processingStepDetails: {
      prepare: get("#processing-step-prepare-detail"),
      process: get("#processing-step-process-detail"),
      finalize: get("#processing-step-finalize-detail"),
    },
    processingStepProcessLabel: get("#processing-step-process-label"),
    downloadControls: get("#download-controls"),
    outputFilename: get("#output-filename"),
    downloadLink: get("#download-link"),
  };
}

export function initializeUi(elements, browserNavigator = navigator) {
  const isMobileBrowser =
    browserNavigator.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(browserNavigator.userAgent) ||
    (/Macintosh/i.test(browserNavigator.userAgent) &&
      browserNavigator.maxTouchPoints > 1);
  elements.mobileWarning.hidden = !isMobileBrowser;

  if (!isGoogleChrome(browserNavigator)) {
    elements.browserGate.addEventListener("cancel", (event) => {
      event.preventDefault();
    });
    elements.browserGate.addEventListener("close", () => {
      elements.browserGate.showModal();
    });
    elements.browserGate.showModal();
  }

  setIconOnlyControl(elements.brandMark, "brand");
  setIconOnlyControl(elements.speedTooltip, "info");
  setIconOnlyControl(elements.cancelSubject, "close");
  setIconOnlyControl(elements.copyReencodeCommand, "copy");
  setLabeledControl(elements.ffmpegDownloadLink, "Get FFmpeg", "external");
  setIconOnlyControl(elements.clearSubject, "trash");
  setLabeledControl(elements.followSubject, "Track", "track");
  setLabeledControl(elements.stopFollowing, "Stop", "stop");
}
