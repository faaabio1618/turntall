import { describe, expect, it, vi } from "vitest";
import { createFinalizationSignal } from "../src/conversion-progress.js";

describe("conversion finalization signal", () => {
  it("moves to finalization only when frame processing is complete", () => {
    const onFinalizing = vi.fn();
    const signal = createFinalizationSignal(onFinalizing);

    expect(signal(0.99)).toBe(false);
    expect(signal(0.999)).toBe(false);
    expect(signal(1)).toBe(true);
    expect(onFinalizing).toHaveBeenCalledOnce();
  });

  it("signals finalization only once and ignores invalid progress", () => {
    const onFinalizing = vi.fn();
    const signal = createFinalizationSignal(onFinalizing);

    expect(signal(Number.NaN)).toBe(false);
    expect(signal(1)).toBe(true);
    expect(signal(1)).toBe(false);
    expect(onFinalizing).toHaveBeenCalledOnce();
  });
});
