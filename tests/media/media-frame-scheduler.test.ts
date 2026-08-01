import { describe, expect, it, vi } from "vitest";
import { MediaFrameScheduler } from "../../src/media/media-frame-scheduler.ts";

describe("MediaFrameScheduler", () => {
  it("prefers native video frame callbacks and clears after running", () => {
    let scheduledCallback;
    const media = {
      requestVideoFrameCallback: vi.fn((callback) => {
        scheduledCallback = callback;
        return 42;
      }),
      cancelVideoFrameCallback: vi.fn(),
    };
    const scheduler = new MediaFrameScheduler(media);
    const callback = vi.fn();

    expect(scheduler.schedule(callback)).toBe(true);
    expect(scheduler.schedule(callback)).toBe(false);
    expect(scheduler.pending).toBe(true);

    scheduledCallback(1, { mediaTime: 2 });

    expect(callback).toHaveBeenCalledWith(1, { mediaTime: 2 });
    expect(scheduler.pending).toBe(false);
  });

  it("cancels a native video frame callback", () => {
    const media = {
      requestVideoFrameCallback: vi.fn(() => 7),
      cancelVideoFrameCallback: vi.fn(),
    };
    const scheduler = new MediaFrameScheduler(media);

    scheduler.schedule(vi.fn());

    expect(scheduler.cancel()).toBe(true);
    expect(media.cancelVideoFrameCallback).toHaveBeenCalledWith(7);
    expect(scheduler.cancel()).toBe(false);
  });

  it("falls back to animation frames", () => {
    let scheduledCallback;
    const animationFrame = {
      requestAnimationFrame: vi.fn((callback) => {
        scheduledCallback = callback;
        return 9;
      }),
      cancelAnimationFrame: vi.fn(),
    };
    const scheduler = new MediaFrameScheduler({}, animationFrame);
    const callback = vi.fn();

    scheduler.schedule(callback);
    scheduler.cancel();

    expect(animationFrame.cancelAnimationFrame).toHaveBeenCalledWith(9);

    scheduler.schedule(callback);
    scheduledCallback(12);
    expect(callback).toHaveBeenCalledWith(12);
  });
});
