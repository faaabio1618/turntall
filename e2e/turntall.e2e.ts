import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const VIDEO_FIXTURE = fileURLToPath(
  new URL("../tests/fixtures/e2e-sample.webm", import.meta.url),
);

async function openSupportedApp(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        brands: [
          { brand: "Chromium", version: "136" },
          { brand: "Google Chrome", version: "136" },
        ],
        mobile: false,
        platform: "Windows",
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "turntall.com", level: 1 }),
  ).toBeVisible();
  await expect(page.locator("#browser-gate")).not.toBeVisible();
}

function captureRuntimeErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  return errors;
}

async function loadFixture(page) {
  const fileInput = page.locator("#file-input");
  const fileDetails = page.locator("#file-details");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await fileInput.setInputFiles(VIDEO_FIXTURE);
    const editorHandledFile = await expect(fileDetails)
      .toContainText("e2e-sample.webm", { timeout: 2_000 })
      .then(
        () => true,
        () => false,
      );
    if (editorHandledFile) {
      break;
    }
    await fileInput.setInputFiles([]);
  }
  await expect(page.locator("#file-details")).toContainText(
    "e2e-sample.webm",
  );
  await expect(page.locator("#video-preparation-overlay")).toBeHidden({
    timeout: 30_000,
  });
  await expect(page.locator("#video-panel")).toBeVisible();
  await expect(page.locator("#selection-panel")).toBeVisible();
  await expect(page.locator("#output-options-panel")).toBeVisible();
  await expect(page.locator("#output-preview-panel")).toBeVisible();
  await expect(page.locator("#cut-button")).toBeEnabled({
    timeout: 30_000,
  });
}

async function drawSubjectBox(
  page,
  { left = 0.2, top = 0.2, right = 0.62, bottom = 0.62 } = {},
) {
  const preview = page.locator("#preview");
  await preview.scrollIntoViewIfNeeded();
  const bounds = await preview.boundingBox();
  expect(bounds).not.toBeNull();

  await page.mouse.move(
    bounds.x + bounds.width * left,
    bounds.y + bounds.height * top,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width * right,
    bounds.y + bounds.height * bottom,
    { steps: 8 },
  );
  await page.mouse.up();
  return bounds;
}

async function outputMetadata(page) {
  const outputURL = await page.locator("#download-link").getAttribute("href");
  return page.evaluate(
    (url) =>
      new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          resolve({
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        };
        video.onerror = () => reject(new Error("Output metadata could not be read."));
        video.src = url;
      }),
    outputURL,
  );
}

test("blocks unsupported Chromium browsers", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgentData", {
      configurable: true,
      value: {
        brands: [
          { brand: "Chromium", version: "136" },
          { brand: "Microsoft Edge", version: "136" },
        ],
        mobile: false,
        platform: "Windows",
      },
    });
  });
  await page.goto("/");

  const dialog = page.locator("#browser-gate");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Open this page in Google Chrome");
});

test("loads a local video, updates the segment, and previews it", async ({
  page,
}) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);

  await expect(page.locator("#file-details")).toHaveText(
    "No video selected.",
  );
  await expect(page.locator("#video-panel")).toBeHidden();
  await expect(page.locator(".seo-section")).toBeVisible();

  await loadFixture(page);

  const metadata = await page.locator("#preview").evaluate((video) => ({
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    readyState: video.readyState,
  }));
  expect(metadata.width).toBe(320);
  expect(metadata.height).toBe(180);
  expect(metadata.duration).toBeGreaterThan(2.9);
  expect(metadata.duration).toBeLessThan(3.1);
  expect(metadata.readyState).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#video-fps")).toHaveText("30 fps");
  await expect(page.locator("#set-start")).toHaveText("Use current");
  await expect(page.locator("#set-end")).toHaveText("Use current");
  await expect(page.locator("#video-speed-value")).toHaveText("1×");
  await expect(page.locator(".output-speed-scale")).toHaveCount(0);
  await expect(page.locator("#subject-onboarding")).toHaveClass(
    /active/,
  );
  await expect(page.locator(".subject-onboarding-box")).toHaveCSS(
    "animation-name",
    "subject-onboarding-box",
  );

  const outputPreviewStage = page.locator(".output-preview-stage");
  await page.locator("#vertical-mode").check();
  await expect(outputPreviewStage).toHaveClass(/vertical/);
  const verticalPreviewBounds = await outputPreviewStage.boundingBox();
  expect(verticalPreviewBounds).not.toBeNull();
  expect(
    verticalPreviewBounds.width / verticalPreviewBounds.height,
  ).toBeCloseTo(9 / 16, 2);
  await page.locator("#vertical-mode").uncheck();

  const sourceVideo = page.locator("#preview");
  await sourceVideo.click({ position: { x: 80, y: 80 } });
  await expect
    .poll(() => sourceVideo.evaluate((video) => video.paused))
    .toBe(false);
  await sourceVideo.click({ position: { x: 80, y: 80 } });
  await expect
    .poll(() => sourceVideo.evaluate((video) => video.paused))
    .toBe(true);
  await sourceVideo.press("Space");
  await expect
    .poll(() => sourceVideo.evaluate((video) => video.paused))
    .toBe(false);
  await sourceVideo.press("Space");
  await expect
    .poll(() => sourceVideo.evaluate((video) => video.paused))
    .toBe(true);

  await page.locator("#set-end").focus();
  const timeBeforeArrow = await sourceVideo.evaluate(
    (video) => video.currentTime,
  );
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => sourceVideo.evaluate((video) => video.currentTime))
    .toBeCloseTo(timeBeforeArrow + 1 / 30, 2);
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => sourceVideo.evaluate((video) => video.currentTime))
    .toBeCloseTo(timeBeforeArrow, 2);

  const endTimeInput = page.locator("#end-time");
  const endValueBeforeArrow = await endTimeInput.inputValue();
  await endTimeInput.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => sourceVideo.evaluate((video) => video.currentTime))
    .toBeCloseTo(timeBeforeArrow + 1 / 30, 2);
  await expect(endTimeInput).toHaveValue(endValueBeforeArrow);

  await page.locator("#end-time").fill("1.50");
  await page.locator("#end-time").press("Tab");
  const selectedEnd = Number(
    await page.locator("#end-time").inputValue(),
  );
  expect(selectedEnd).toBeGreaterThan(0);
  expect(selectedEnd).toBeLessThan(metadata.duration);
  expect(
    Number(await page.locator("#end-range").inputValue()),
  ).toBeCloseTo(selectedEnd, 2);
  await expect(page.locator("#selection-summary")).not.toHaveClass(
    /error/,
  );

  const previewButton = page.locator("#output-preview-toggle");
  await expect(previewButton).toBeEnabled();
  await previewButton.click();
  await expect(previewButton).toContainText("Pause preview");
  await expect
    .poll(() =>
      page
        .locator("#output-preview-media")
        .evaluate((video) => video.paused),
    )
    .toBe(false);
  await previewButton.click();
  await expect(previewButton).toContainText("Play preview");
  expect(runtimeErrors).toEqual([]);
});

test("restores the user's audio choice after speed changes", async ({
  page,
}) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  const speed = page.locator("#video-speed");
  const keepAudio = page.locator("#keep-audio");
  await expect(keepAudio).toBeChecked();
  await expect(keepAudio).toBeEnabled();

  await speed.fill("2");
  await expect(page.locator("#video-speed-value")).toHaveText(
    "2× · Muted",
  );
  await expect(keepAudio).not.toBeChecked();
  await expect(keepAudio).toBeDisabled();
  await expect(page.locator("#cut-button")).toContainText("Muted");

  await speed.fill("1");
  await expect(keepAudio).toBeChecked();
  await expect(keepAudio).toBeEnabled();

  await keepAudio.uncheck();
  await speed.fill("2");
  await speed.fill("1");
  await expect(keepAudio).not.toBeChecked();
  await expect(keepAudio).toBeEnabled();
  expect(runtimeErrors).toEqual([]);
});

test("draws, saves, and clears a subject position safely", async ({
  page,
}) => {
  await page.setViewportSize({ width: 500, height: 900 });
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  const preview = page.locator("#preview");
  const bounds = await drawSubjectBox(page);

  await expect(page.locator("#subject-overlay")).toHaveClass(/active/);
  await expect(page.locator("#subject-box")).toBeVisible();
  const saveSubject = page.getByRole("button", {
    name: "Create vertical video",
    exact: true,
  });
  await expect(saveSubject).toBeEnabled();
  const saveSubjectBounds = await saveSubject.boundingBox();
  expect(saveSubjectBounds).not.toBeNull();
  await saveSubject.click();

  await expect(page.locator("#saved-subject-box")).toBeVisible();
  await expect(page.locator(".subject-reference")).toHaveCount(1);
  await expect(page.locator("#vertical-mode")).toBeChecked();
  await expect(page.locator("#vertical-mode")).toBeDisabled();
  const trackSubject = page.getByRole("button", {
    name: "Track subject (Spacebar)",
  });
  const trackSubjectBounds = await trackSubject.boundingBox();
  expect(trackSubjectBounds).not.toBeNull();
  expect(trackSubjectBounds.x).toBeCloseTo(saveSubjectBounds.x, 0);
  expect(trackSubjectBounds.width).toBeCloseTo(
    saveSubjectBounds.width,
    0,
  );

  const speedSelect = page.locator("#tracking-frame-skip");
  const speedTooltip = page.locator(".tooltip-trigger");
  await speedSelect.hover();
  await expect
    .poll(() =>
      speedTooltip.evaluate(
        (element) => getComputedStyle(element, "::after").opacity,
      ),
    )
    .toBe("0");

  const tooltipBounds = await speedTooltip.boundingBox();
  expect(tooltipBounds).not.toBeNull();
  expect(tooltipBounds.width).toBeLessThan(30);
  await speedTooltip.hover();
  await expect
    .poll(() =>
      speedTooltip.evaluate(
        (element) => getComputedStyle(element, "::after").opacity,
      ),
    )
    .toBe("1");
  expect(
    await speedTooltip.evaluate(
      (element) => getComputedStyle(element, "::after").bottom,
    ),
  ).not.toBe("auto");

  await page.mouse.click(
    bounds.x + bounds.width * 0.85,
    bounds.y + bounds.height * 0.25,
  );
  await expect
    .poll(() => preview.evaluate((video) => video.paused))
    .toBe(true);

  await page.locator("#clear-subject").click();
  const clearDialog = page.locator("#clear-subject-dialog");
  await expect(clearDialog).toBeVisible();
  await clearDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".subject-reference")).toHaveCount(1);

  await page.locator("#clear-subject").click();
  await clearDialog.getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator(".subject-reference")).toHaveCount(0);
  await expect(page.locator("#saved-subject-box")).toBeHidden();
  await expect(page.locator("#vertical-mode")).toBeEnabled();
  expect(runtimeErrors).toEqual([]);
});

test("hides a saved subject box before its first frame", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  const preview = page.locator("#preview");
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect
    .poll(() => preview.evaluate((video) => video.currentTime))
    .toBeGreaterThan(0.03);
  const savedTime = await preview.evaluate((video) => video.currentTime);

  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();
  await expect(page.locator("#saved-subject-box")).toBeVisible();

  for (let step = 0; step < 15; step += 1) {
    await page.keyboard.press("ArrowLeft");
  }
  await expect
    .poll(() => preview.evaluate((video) => video.currentTime))
    .toBeLessThan(savedTime - 0.01);
  await expect(page.locator("#saved-subject-box")).toBeHidden();
  await expect(page.locator("#crop-preview")).toBeHidden();
  await expect(page.locator("#tracking-status")).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("hides a saved subject box after its last frame", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();
  await expect(page.locator("#saved-subject-box")).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#saved-subject-box")).toBeHidden();
  await expect(page.locator("#crop-preview")).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("warns before leaving only when subject frames are saved", async ({
  page,
}) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  const exitWouldBeBlocked = () =>
    page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });

  expect(await exitWouldBeBlocked()).toBe(false);
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();
  expect(await exitWouldBeBlocked()).toBe(true);

  await page.locator("#clear-subject").click();
  await page
    .locator("#clear-subject-dialog")
    .getByRole("button", { name: "Clear all" })
    .click();
  await expect(page.locator(".subject-reference")).toHaveCount(0);
  expect(await exitWouldBeBlocked()).toBe(false);
  expect(runtimeErrors).toEqual([]);
});

test("confirms before replacing a video with saved subject frames", async ({
  page,
}) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();

  const fileInput = page.locator("#file-input");
  const dialog = page.locator("#replace-video-dialog");
  await fileInput.setInputFiles([]);
  await fileInput.setInputFiles(VIDEO_FIXTURE);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".subject-reference")).toHaveCount(1);

  await fileInput.setInputFiles(VIDEO_FIXTURE);
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Replace video" })
    .click();
  await expect(page.locator(".subject-reference")).toHaveCount(0);
  await expect(page.locator("#video-preparation-overlay")).toBeHidden({
    timeout: 30_000,
  });
  expect(runtimeErrors).toEqual([]);
});

test("Spacebar saves, starts, and stops the primary subject action", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await drawSubjectBox(page);

  await page.keyboard.press("Space");
  await expect(page.locator(".subject-reference")).toHaveCount(1);
  await expect(page.locator("#subject-overlay")).not.toHaveClass(/active/);

  await page.locator("#video-speed").focus();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe("video-speed");
  await page.keyboard.press("Space");
  const stop = page.locator("#stop-following");
  await expect(stop).toBeVisible();
  await expect(page.locator("#crop-preview")).toHaveClass(
    /provisional/,
  );
  await expect(page.locator("#crop-preview-label")).toHaveText(
    "Stabilizing",
  );
  await expect(page.locator("#tracking-stabilization-tail")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(stop).toBeHidden({ timeout: 30_000 });
  await expect(page.locator("#crop-preview")).not.toHaveClass(
    /provisional/,
  );
  await expect(page.locator("#crop-preview-label")).toHaveText("Crop");
  await expect(page.locator("#tracking-stabilization-tail")).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("an arrow always leaves subject selection and steps one frame", async ({
  page,
}) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  const preview = page.locator("#preview");
  await drawSubjectBox(page);
  const timeBeforeArrow = await preview.evaluate(
    (video) => video.currentTime,
  );
  await page.locator("#confirm-subject").focus();
  await page.keyboard.press("ArrowRight");

  await expect(page.locator("#subject-overlay")).not.toHaveClass(
    /active/,
  );
  await expect(page.locator("#subject-box")).toBeHidden();
  await expect
    .poll(() => preview.evaluate((video) => video.currentTime))
    .toBeCloseTo(timeBeforeArrow + 1 / 30, 2);
  expect(runtimeErrors).toEqual([]);
});

test("keeps the viewing message on the presented frame", async ({
  page,
}) => {
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  const preview = page.locator("#preview");
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();

  await page.keyboard.press("ArrowRight");
  await drawSubjectBox(page);
  await page.locator("#confirm-subject").click();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => {
      const status = await page
        .locator("#tracking-status-message")
        .textContent();
      const indicator = await page
        .locator("#preview-frame-indicator")
        .textContent();
      const statusFrame = status?.match(/frame (\d+)/i)?.[1];
      const indicatorFrame = indicator?.match(/Frame (\d+)/)?.[1];
      return Boolean(statusFrame) && statusFrame === indicatorFrame;
    })
    .toBe(true);
  expect(runtimeErrors).toEqual([]);
});

test("tracks the selected subject through decoded frames", async ({ page }) => {
  test.setTimeout(90_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();

  await page.locator("#tracking-frame-skip").selectOption("6");
  await page.getByRole("button", { name: /Track subject/ }).click();
  await expect(page.locator("#stop-following")).toBeVisible();
  await expect(page.locator("#stop-following")).toBeHidden({
    timeout: 30_000,
  });
  await expect(page.locator(".subject-reference")).not.toHaveCount(0);
  await expect(page.locator("#preview")).toHaveJSProperty("paused", true);
  const displayedFrame =
    (await page.locator("#preview-frame-indicator").textContent()) ?? "";
  const finalReferenceLabel = await page
    .locator(".subject-reference.automatic")
    .getAttribute("aria-label");
  expect(displayedFrame).not.toBe("");
  expect(finalReferenceLabel).toContain(displayedFrame.toLowerCase());
  expect(runtimeErrors).toEqual([]);
});

test("resumes from the frame reached by Stop without asking for a redraw", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();

  await page.locator("#tracking-frame-skip").selectOption("6");
  await page.getByRole("button", { name: /Track subject/ }).click();
  const stop = page.locator("#stop-following");
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(stop).toBeHidden({ timeout: 30_000 });

  await page.getByRole("button", { name: /Track subject/ }).click();
  await expect(page.locator("#restart-tracking-dialog")).toBeHidden();
  await expect(stop).toBeVisible();
  await expect(stop).toBeHidden({ timeout: 30_000 });
  expect(runtimeErrors).toEqual([]);
});

test("does not reseek when redrawing a tracked frame after stepping back", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();

  await page.getByRole("button", { name: /Track subject/ }).click();
  await expect(page.locator("#stop-following")).toBeHidden({
    timeout: 30_000,
  });

  const preview = page.locator("#preview");
  await preview.focus();
  for (let frame = 0; frame < 30; frame += 1) {
    await page.keyboard.press("ArrowLeft");
  }
  await expect.poll(() => preview.evaluate((video) => video.seeking)).toBe(
    false,
  );
  await preview.evaluate((video) => {
    video.dataset.correctionSeekCount = "0";
    video.addEventListener(
      "seeking",
      () => {
        video.dataset.correctionSeekCount = String(
          Number(video.dataset.correctionSeekCount) + 1,
        );
      },
      { once: true },
    );
  });

  await drawSubjectBox(page, {
    left: 0.3,
    top: 0.25,
    right: 0.7,
    bottom: 0.65,
  });

  await expect(page.locator("#subject-overlay")).toHaveClass(/active/);
  await expect(preview).toHaveAttribute("data-correction-seek-count", "0");
  expect(runtimeErrors).toEqual([]);
});

test("does not ask to delete boxes when redrawing the final tracked frame", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();

  await page.getByRole("button", { name: /Track subject/ }).click();
  const stop = page.locator("#stop-following");
  await expect(stop).toBeVisible();
  await expect(stop).toBeHidden({ timeout: 30_000 });

  await drawSubjectBox(page, {
    left: 0.3,
    top: 0.25,
    right: 0.7,
    bottom: 0.65,
  });
  await page.locator("#confirm-subject").click();

  await expect(page.locator("#later-subject-dialog")).toBeHidden();
  await expect(page.locator("#subject-overlay")).not.toHaveClass(
    /active/,
  );
  expect(runtimeErrors).toEqual([]);
});

test("requires a fresh box whenever tracking asks for a correction", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();

  await page.locator("#tracking-frame-skip").selectOption("6");
  await page.getByRole("button", { name: /Track subject/ }).click();
  await expect(page.locator("#stop-following")).toBeHidden({
    timeout: 30_000,
  });

  const preview = page.locator("#preview");
  await preview.focus();
  for (let frame = 0; frame < 6; frame += 1) {
    await page.keyboard.press("ArrowLeft");
  }
  await expect.poll(() => preview.evaluate((video) => video.seeking)).toBe(
    false,
  );

  await page.getByRole("button", { name: /Track subject/ }).click();
  const restartDialog = page.locator("#restart-tracking-dialog");
  await expect(restartDialog).toBeVisible();
  await restartDialog
    .getByRole("button", { name: "Redraw this frame" })
    .click();
  await expect(page.locator("#subject-overlay")).toHaveClass(/active/);
  await expect(page.locator("#subject-box")).toBeHidden();

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#subject-overlay")).not.toHaveClass(
    /active/,
  );
  const redraw = page.getByRole("button", {
    name: "Draw a new box (Spacebar)",
  });
  await redraw.click();

  await expect(page.locator("#subject-box")).toBeHidden();
  await expect(page.locator("#confirm-subject")).toBeDisabled();
  await drawSubjectBox(page, {
    left: 0.3,
    top: 0.25,
    right: 0.7,
    bottom: 0.65,
  });
  await page.locator("#confirm-subject").click();
  const laterBoxesDialog = page.locator("#later-subject-dialog");
  await expect(laterBoxesDialog).toBeVisible();
  await laterBoxesDialog
    .getByRole("button", { name: "Delete later boxes" })
    .click();
  await expect(
    page.getByRole("button", { name: /Track subject/ }),
  ).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("steps one frame when an arrow is pressed immediately after Stop", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();

  await page.locator("#tracking-frame-skip").selectOption("6");
  await page.getByRole("button", { name: /Track subject/ }).click();
  const stop = page.locator("#stop-following");
  await expect(stop).toBeVisible();
  const stopBounds = await stop.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.x,
      pageY: bounds.y + window.scrollY,
      width: bounds.width,
    };
  });
  await stop.click();
  await page.keyboard.press("ArrowRight");
  await expect(stop).toBeHidden({ timeout: 30_000 });

  const confidenceEnd = await page
    .locator("#tracking-confidence-end")
    .textContent();
  const [minutes, seconds] = confidenceEnd.split(":").map(Number);
  const lastTrackedTime = minutes * 60 + seconds;
  const currentTime = await page
    .locator("#preview")
    .evaluate((video) => video.currentTime);
  expect(currentTime).toBeGreaterThan(lastTrackedTime + 0.02);
  expect(currentTime).toBeLessThan(lastTrackedTime + 0.06);

  await page.locator(".subject-reference.automatic").click();
  const saveSubjectPosition = page.locator("#confirm-subject");
  await expect(saveSubjectPosition).toHaveText("Save position");
  const saveBounds = await saveSubjectPosition.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.x,
      y: bounds.y,
      pageY: bounds.y + window.scrollY,
      width: bounds.width,
      height: bounds.height,
    };
  });
  const confidenceBounds = await page
    .locator("#tracking-confidence")
    .boundingBox();
  expect(confidenceBounds).not.toBeNull();
  expect(saveBounds.x).toBeCloseTo(stopBounds.x, 0);
  expect(saveBounds.width).toBeCloseTo(stopBounds.width, 0);
  expect(saveBounds.y + saveBounds.height).toBeLessThan(
    confidenceBounds.y,
  );
  expect(
    await saveSubjectPosition.evaluate((element) =>
      Boolean(
        element.compareDocumentPosition(
          document.querySelector("#tracking-confidence"),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
  expect(runtimeErrors).toEqual([]);
});

test("an arrow stops active tracking and then steps one frame", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await drawSubjectBox(page);
  await page
    .getByRole("button", { name: "Create vertical video", exact: true })
    .click();

  await page.locator("#tracking-frame-skip").selectOption("6");
  await page.getByRole("button", { name: /Track subject/ }).click();
  const stop = page.locator("#stop-following");
  await expect(stop).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(stop).toBeHidden({ timeout: 30_000 });

  const confidenceEnd = await page
    .locator("#tracking-confidence-end")
    .textContent();
  const [minutes, seconds] = confidenceEnd.split(":").map(Number);
  const lastTrackedTime = minutes * 60 + seconds;
  const currentTime = await page
    .locator("#preview")
    .evaluate((video) => video.currentTime);
  expect(currentTime).toBeGreaterThan(lastTrackedTime + 0.02);
  expect(currentTime).toBeLessThan(lastTrackedTime + 0.06);
  expect(runtimeErrors).toEqual([]);
});

test("arrows step the source while output is processing", async ({ page }) => {
  test.setTimeout(90_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);
  await page.locator("#vertical-mode").check();

  const preview = page.locator("#preview");
  const timeBeforeArrow = await preview.evaluate(
    (video) => video.currentTime,
  );
  await page.locator("#cut-button").click();
  const cancel = page.locator("#cancel-button");
  await expect(cancel).toBeVisible();
  await cancel.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => preview.evaluate((video) => video.currentTime))
    .toBeCloseTo(timeBeforeArrow + 1 / 30, 2);

  if (await cancel.isVisible()) {
    await cancel.click();
  }
  expect(runtimeErrors).toEqual([]);
});

test("exports a muted speed-adjusted MP4", async ({ page }) => {
  test.setTimeout(120_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  await page.locator("#end-time").fill("1");
  await page.locator("#end-time").press("Tab");
  await page.locator("#video-speed").fill("2");
  await expect(page.locator("#keep-audio")).toBeDisabled();
  await page.locator("#cut-button").click();

  const download = page.locator("#download-link");
  await expect(download).toBeVisible({ timeout: 90_000 });
  await expect(download).toHaveAttribute("download", "e2e-sample-cut.mp4");
  const metadata = await outputMetadata(page);
  expect(metadata).toMatchObject({ width: 320, height: 180 });
  expect(metadata.duration).toBeGreaterThan(0.4);
  expect(metadata.duration).toBeLessThan(0.65);
  expect(runtimeErrors).toEqual([]);
});

test("exports a real 9:16 vertical MP4", async ({ page }) => {
  test.setTimeout(120_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  await page.locator("#end-time").fill("1");
  await page.locator("#end-time").press("Tab");
  await page.locator("#vertical-mode").check();
  await page.locator("#cut-button").click();

  const download = page.locator("#download-link");
  await expect(download).toBeVisible({ timeout: 90_000 });
  await expect(download).toHaveAttribute(
    "download",
    "e2e-sample-vertical.mp4",
  );
  const metadata = await outputMetadata(page);
  expect(metadata).toMatchObject({ width: 100, height: 180 });
  expect(metadata.duration).toBeGreaterThan(0.9);
  expect(metadata.duration).toBeLessThan(1.1);
  expect(runtimeErrors).toEqual([]);
});

test("cancels an FFmpeg export before safely starting another", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  await page.locator("#vertical-mode").check();
  await page.locator("#cut-button").click();
  const cancel = page.locator("#cancel-button");
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(page.locator("#status")).toHaveText("Cut cancelled.", {
    timeout: 30_000,
  });
  await expect(page.locator("#cut-button")).toBeEnabled();

  await page.locator("#vertical-mode").uncheck();
  await page.locator("#end-time").fill("1");
  await page.locator("#end-time").press("Tab");
  await page.locator("#cut-button").click();
  await expect(page.locator("#download-link")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator("#status")).toContainText("Finished locally");
  expect(runtimeErrors).toEqual([]);
});

test("creates a short local output and manages its filename", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const runtimeErrors = captureRuntimeErrors(page);
  await openSupportedApp(page);
  await loadFixture(page);

  await page.locator("#start-time").fill("0");
  await page.locator("#start-time").press("Tab");
  await page.locator("#end-time").fill("1");
  await page.locator("#end-time").press("Tab");
  await expect(page.locator("#cut-button")).toBeEnabled();
  const automaticDownloadPromise = page.waitForEvent("download", {
    timeout: 60_000,
  });
  await page.locator("#cut-button").click();

  const download = page.locator("#download-link");
  await expect(download).toBeVisible({ timeout: 60_000 });
  const automaticDownload = await automaticDownloadPromise;
  expect(automaticDownload.suggestedFilename()).toBe(
    "e2e-sample-cut.webm",
  );
  await expect(page.locator("#status")).toContainText(
    "Finished locally",
  );
  await expect(page.locator(".processing-step[data-state='done']")).toHaveCount(
    3,
  );
  await expect(download).toHaveAttribute("href", /^blob:/);
  await expect(download).toHaveAttribute(
    "download",
    "e2e-sample-cut.webm",
  );

  const filename = page.locator("#output-filename");
  await filename.fill("renamed.webm");
  await expect(download).toHaveAttribute("download", "renamed.webm");
  await filename.fill("");
  await page.locator("#status").click();
  await expect(filename).toHaveValue("e2e-sample-cut.webm");
  await expect(download).toHaveAttribute(
    "download",
    "e2e-sample-cut.webm",
  );
  expect(runtimeErrors).toEqual([]);
});
