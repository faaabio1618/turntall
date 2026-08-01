const CONTAINER_DETAILS = {
  mp4: { extension: "mp4", label: "MP4", mimeType: "video/mp4" },
  mov: { extension: "mov", label: "QuickTime MOV", mimeType: "video/quicktime" },
  webm: { extension: "webm", label: "WebM", mimeType: "video/webm" },
  mkv: {
    extension: "mkv",
    label: "Matroska MKV",
    mimeType: "video/x-matroska",
  },
  avi: { extension: "avi", label: "AVI", mimeType: "video/x-msvideo" },
  mpegts: { extension: "ts", label: "MPEG-TS", mimeType: "video/mp2t" },
  mpeg: { extension: "mpg", label: "MPEG", mimeType: "video/mpeg" },
  ogg: { extension: "ogv", label: "Ogg Video", mimeType: "video/ogg" },
  flv: { extension: "flv", label: "Flash Video", mimeType: "video/x-flv" },
  asf: { extension: "asf", label: "ASF", mimeType: "video/x-ms-asf" },
};

const WEBM_VIDEO_CODECS = new Set(["av1", "vp8", "vp9"]);
const WEBM_AUDIO_CODECS = new Set(["opus", "vorbis"]);

export function sourceExtension(filename) {
  const match = filename.toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return match ? match[1] : "";
}

export function parseDecoderList(logLines) {
  const decoders = new Set();

  for (const line of logLines) {
    const match = line.match(/^\s*[VAS][A-Z.]{5}\s+([a-z0-9_]+)/i);
    if (match) {
      decoders.add(match[1].toLowerCase());
    }
  }

  return decoders;
}

function parseDuration(text) {
  const match = text.match(
    /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/,
  );
  if (!match) {
    return undefined;
  }

  return (
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  );
}

export function parseMediaProbeLogs(logLines) {
  const text = logLines.join("\n");
  const inputMatch = text.match(/Input #0,\s*(.+?),\s*from\s+/);
  const videoMatch = text.match(/Stream #0:[^\n]*Video:\s*([a-z0-9_]+)/i);
  const audioMatch = text.match(/Stream #0:[^\n]*Audio:\s*([a-z0-9_]+)/i);
  const dimensionsMatch = text.match(
    /Stream #0:[^\n]*Video:[^\n]*?,\s*(\d{2,5})x(\d{2,5})(?:[,\s])/i,
  );
  const frameRateMatch = text.match(
    /Stream #0:[^\n]*Video:[^\n]*?\b(\d+(?:\.\d+)?)\s*fps\b/i,
  );

  return {
    containerNames: inputMatch
      ? inputMatch[1].split(",").map((name) => name.trim().toLowerCase())
      : [],
    videoCodec: videoMatch?.[1]?.toLowerCase(),
    audioCodec: audioMatch?.[1]?.toLowerCase(),
    duration: parseDuration(text),
    width: dimensionsMatch ? Number(dimensionsMatch[1]) : undefined,
    height: dimensionsMatch ? Number(dimensionsMatch[2]) : undefined,
    frameRate: frameRateMatch
      ? Number(frameRateMatch[1])
      : undefined,
  };
}

function isWebMCompatible(videoCodec, audioCodec) {
  return (
    WEBM_VIDEO_CODECS.has(videoCodec) &&
    (!audioCodec || WEBM_AUDIO_CODECS.has(audioCodec))
  );
}

export function selectStreamCopyContainer(media, filename) {
  const formats = new Set(media.containerNames);
  const extension = sourceExtension(filename);

  if (
    formats.has("mov") ||
    formats.has("mp4") ||
    formats.has("m4a") ||
    formats.has("3gp")
  ) {
    const movPreferred =
      extension === "mov" ||
      ["prores", "qtrle", "dnxhd"].includes(media.videoCodec);
    return CONTAINER_DETAILS[movPreferred ? "mov" : "mp4"];
  }

  if (formats.has("matroska") || formats.has("webm")) {
    const useWebM =
      extension === "webm" &&
      isWebMCompatible(media.videoCodec, media.audioCodec);
    return CONTAINER_DETAILS[useWebM ? "webm" : "mkv"];
  }

  for (const format of [
    "avi",
    "mpegts",
    "mpeg",
    "ogg",
    "flv",
    "asf",
  ]) {
    if (formats.has(format)) {
      return CONTAINER_DETAILS[format];
    }
  }

  return {
    ...CONTAINER_DETAILS.mkv,
    fallback: true,
  };
}

export function decoderSupport(media, decoderNames) {
  if (!decoderNames.size) {
    return { canReencode: true, missingDecoders: [] };
  }

  const codecs = [media.videoCodec, media.audioCodec].filter(Boolean);
  const missingDecoders = codecs.filter(
    (codec) => !decoderNames.has(codec),
  );

  return {
    canReencode: Boolean(media.videoCodec) && missingDecoders.length === 0,
    missingDecoders,
  };
}

export function mediaCompatibilityWarning({
  readable,
  canReencode,
  browserPreviewReadable,
}) {
  if (!readable) {
    return "This video cannot be processed in your browser. Try another video or export it again from your video editor.";
  }

  const warnings = [];
  if (browserPreviewReadable === false) {
    warnings.push(
      "A preview is not available for this video, but cutting may still work.",
    );
  }
  if (!canReencode) {
    warnings.push(
      "Exact cuts and vertical video are not available for this video. Fast cutting still works.",
    );
  }

  return warnings.join(" ");
}

export function processingFailureMessage(
  error,
  { browserEncoding = false, vertical = false } = {},
) {
  const details =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const unsupportedEncoder =
    /(?:encoder configuration|videoencoder)[\s\S]*(?:not supported|unsupported)/i.test(
      details,
    ) ||
    /(?:not supported|unsupported)[\s\S]*(?:encoder configuration|videoencoder)/i.test(
      details,
    );

  if (browserEncoding && unsupportedEncoder) {
    return vertical
      ? "This browser cannot create a vertical video from this file. Open this page in Chrome and try again."
      : "This browser cannot make an exact cut from this file. Open this page in Chrome and try again.";
  }

  return "This video could not be cut with the selected options. Try fast cut mode or another video.";
}
