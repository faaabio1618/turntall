import {
  ArrowRight,
  Copy,
  Download,
  ExternalLink,
  Info,
  LoaderCircle,
  RectangleVertical,
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
import {
  isGoogleChrome,
  type BrowserNavigator,
} from "../platform/browser-support.ts";

const ICONS = {
  arrowRight: ArrowRight,
  brand: RectangleVertical,
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

function requiredElement<T extends Element>(
  selector: string,
  root: ParentNode = document,
): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`Required UI element not found: ${selector}`);
  }
  return element as T;
}

export type IconName = keyof typeof ICONS;

function icon(name: IconName, size = 18) {
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

export function setLabeledControl(
  control: Element,
  label: string,
  iconName: IconName,
) {
  control.replaceChildren(
    icon(iconName),
    document.createTextNode(label),
  );
}

export function setIconOnlyControl(control: Element, iconName: IconName) {
  control.replaceChildren(icon(iconName));
}

export function collectUiElements(root: ParentNode = document) {
  const get = <T extends Element = HTMLElement>(selector: string) =>
    requiredElement<T>(selector, root);

  return {
    brandMark: get("#brand-mark"),
    browserGate: get<HTMLDialogElement>("#browser-gate"),
    mobileWarning: get("#mobile-warning"),
    fileInput: get<HTMLInputElement>("#file-input"),
    fileDetails: get("#file-details"),
    formatSummary: get("#format-summary"),
    reencodeSuggestion: get("#reencode-suggestion"),
    reencodeCommand: get("#reencode-command"),
    copyReencodeCommand: get<HTMLButtonElement>("#copy-reencode-command"),
    reencodeCopyStatus: get("#reencode-copy-status"),
    ffmpegDownloadLink: get<HTMLAnchorElement>("#ffmpeg-download-link"),
    videoPanel: get("#video-panel"),
    videoFps: get("#video-fps"),
    previewStage: get("#preview-stage"),
    preview: get<HTMLVideoElement>("#preview"),
    videoPreparationOverlay: get("#video-preparation-overlay"),
    videoPreparationMessage: get("#video-preparation-message"),
    frameStepControls: get("#frame-step-controls"),
    frameStepHelp: get("#frame-step-help"),
    cropPreview: get("#crop-preview"),
    cropPreviewLabel: get("#crop-preview-label"),
    previewFrameIndicator: get<HTMLOutputElement>("#preview-frame-indicator"),
    subjectOnboarding: get("#subject-onboarding"),
    subjectOverlay: get("#subject-overlay"),
    subjectInstruction: get("#subject-instruction"),
    subjectSurface: get("#subject-surface"),
    subjectBox: get("#subject-box"),
    savedSubjectBox: get("#saved-subject-box"),
    savedSubjectLabel: get("#saved-subject-label"),
    trackingBox: get("#tracking-box"),
    subjectPicker: get("#subject-picker"),
    subjectEditActions: get("#subject-edit-actions"),
    clearSubject: get<HTMLButtonElement>("#clear-subject"),
    subjectTrackingActions: get("#subject-tracking-actions"),
    followSubject: get<HTMLButtonElement>("#follow-subject"),
    stopFollowing: get<HTMLButtonElement>("#stop-following"),
    trackingFrameSkip: get<HTMLSelectElement>("#tracking-frame-skip"),
    speedTooltip: get(".tooltip-trigger"),
    trackingStatus: get("#tracking-status"),
    trackingStatusMessage: get("#tracking-status-message"),
    trackingStatusShortcut: get("#tracking-status-shortcut"),
    trackingConfidence: get("#tracking-confidence"),
    trackingConfidenceCanvas: get<HTMLCanvasElement>("#tracking-confidence-canvas"),
    trackingConfidencePlayhead: get("#tracking-confidence-playhead"),
    trackingStabilizationTail: get("#tracking-stabilization-tail"),
    trackingConfidenceStart: get("#tracking-confidence-start"),
    trackingConfidenceEnd: get("#tracking-confidence-end"),
    confirmSubject: get<HTMLButtonElement>("#confirm-subject"),
    cancelSubject: get<HTMLButtonElement>("#cancel-subject"),
    subjectJumpRow: get("#subject-jump-row"),
    subjectJump: get<HTMLInputElement>("#subject-jump"),
    subjectReferences: get("#subject-references"),
    clearSubjectDialog: get<HTMLDialogElement>("#clear-subject-dialog"),
    replaceVideoDialog: get<HTMLDialogElement>("#replace-video-dialog"),
    laterSubjectDialog: get<HTMLDialogElement>("#later-subject-dialog"),
    laterSubjectDialogCopy: get("#later-subject-dialog-copy"),
    restartTrackingDialog: get<HTMLDialogElement>("#restart-tracking-dialog"),
    restartTrackingDialogTitle: get("#restart-tracking-dialog-title"),
    restartTrackingDialogCopy: get("#restart-tracking-dialog-copy"),
    selectionPanel: get("#selection-panel"),
    outputOptionsPanel: get("#output-options-panel"),
    startTime: get<HTMLInputElement>("#start-time"),
    endTime: get<HTMLInputElement>("#end-time"),
    startRange: get<HTMLInputElement>("#start-range"),
    endRange: get<HTMLInputElement>("#end-range"),
    startKeyframes: get("#start-keyframes"),
    endKeyframes: get("#end-keyframes"),
    setStart: get<HTMLButtonElement>("#set-start"),
    setEnd: get<HTMLButtonElement>("#set-end"),
    selectionSummary: get("#selection-summary"),
    keyframeSummary: get("#keyframe-summary"),
    snapKeyframes: get<HTMLInputElement>("#snap-keyframes"),
    cutModeHelp: get("#cut-mode-help"),
    verticalMode: get<HTMLInputElement>("#vertical-mode"),
    verticalHelp: get("#vertical-help"),
    keepAudio: get<HTMLInputElement>("#keep-audio"),
    audioHelp: get("#audio-help"),
    videoSpeed: get<HTMLInputElement>("#video-speed"),
    videoSpeedValue: get<HTMLOutputElement>("#video-speed-value"),
    cropSummary: get("#crop-summary"),
    outputPreviewPanel: get("#output-preview-panel"),
    outputPreviewStage: get(".output-preview-stage"),
    outputPreviewMedia: get<HTMLVideoElement>("#output-preview-media"),
    outputPreviewCanvas: get<HTMLCanvasElement>("#output-preview-canvas"),
    outputPreviewFrameIndicator: get<HTMLOutputElement>("#output-preview-frame-indicator"),
    outputPreviewToggle: get<HTMLButtonElement>("#output-preview-toggle"),
    outputPreviewSeek: get<HTMLInputElement>("#output-preview-seek"),
    outputPreviewTime: get<HTMLOutputElement>("#output-preview-time"),
    outputPreviewNote: get("#output-preview-note"),
    cutButton: get<HTMLButtonElement>("#cut-button"),
    cancelButton: get<HTMLButtonElement>("#cancel-button"),
    resultPanel: get("#result-panel"),
    status: get("#status"),
    progress: get<HTMLProgressElement>("#progress"),
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
    outputFilename: get<HTMLInputElement>("#output-filename"),
    downloadLink: get<HTMLAnchorElement>("#download-link"),
  };
}

export function initializeUi(
  elements: ReturnType<typeof collectUiElements>,
  browserNavigator: BrowserNavigator = navigator as BrowserNavigator,
) {
  const isMobileBrowser =
    browserNavigator.userAgentData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(browserNavigator.userAgent) ||
    (/Macintosh/i.test(browserNavigator.userAgent) &&
      browserNavigator.maxTouchPoints > 1);
  elements.mobileWarning.hidden = !isMobileBrowser;

  if (!isGoogleChrome(browserNavigator)) {
    elements.browserGate.addEventListener("cancel", (event: { preventDefault: () => void; }) => {
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
