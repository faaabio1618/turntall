/**
 * Keeps at most one pending frame callback for a media element.
 * Native video-frame callbacks are preferred because they follow decoded
 * frames; requestAnimationFrame remains the browser fallback.
 */
export class MediaFrameScheduler {
  media: HTMLVideoElement;
  animationFrame: Pick<
    typeof globalThis,
    "requestAnimationFrame" | "cancelAnimationFrame"
  >;
  request?: { id: number; type: "video" | "animation" };

  constructor(
    media: HTMLVideoElement,
    animationFrame: Pick<
      typeof globalThis,
      "requestAnimationFrame" | "cancelAnimationFrame"
    > = globalThis,
  ) {
    this.media = media;
    this.animationFrame = animationFrame;
    this.request = undefined;
  }

  get pending() {
    return this.request !== undefined;
  }

  schedule(callback: (...args: any[]) => void) {
    if (this.pending) {
      return false;
    }

    const run = (...args) => {
      this.request = undefined;
      callback(...args);
    };

    if (typeof this.media.requestVideoFrameCallback === "function") {
      this.request = {
        id: this.media.requestVideoFrameCallback(run),
        type: "video",
      };
    } else {
      this.request = {
        id: this.animationFrame.requestAnimationFrame(run),
        type: "animation",
      };
    }
    return true;
  }

  cancel() {
    if (!this.pending) {
      return false;
    }

    const { id, type } = this.request;
    if (
      type === "video" &&
      typeof this.media.cancelVideoFrameCallback === "function"
    ) {
      this.media.cancelVideoFrameCallback(id);
    } else {
      this.animationFrame.cancelAnimationFrame(id);
    }
    this.request = undefined;
    return true;
  }
}
