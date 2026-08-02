      <section
        id="video-panel"
        class="panel"
        aria-labelledby="video-heading"
        hidden
      >
        <div class="panel-heading">
          <h2 id="video-heading">2. Video</h2>
          <span id="video-fps" class="video-fps" hidden></span>
        </div>
        <div id="preview-stage" class="video-stage" hidden>
          <video
            id="preview"
            controls
            preload="auto"
            tabindex="0"
            aria-keyshortcuts="Space ArrowLeft ArrowRight"
          ></video>
          <div
            id="video-preparation-overlay"
            class="video-preparation-overlay"
            role="status"
            aria-live="polite"
            hidden
          >
            <div class="video-preparation-card">
              <span class="loading-spinner" aria-hidden="true"></span>
              <span>
                <strong>Preparing video</strong>
                <small id="video-preparation-message">
                  Loading video details and keyframes…
                </small>
              </span>
            </div>
          </div>
          <div
            id="crop-preview"
            class="crop-preview"
            aria-hidden="true"
            hidden
          >
            <span id="crop-preview-label">Crop</span>
          </div>
          <output
            id="preview-frame-indicator"
            class="preview-frame-indicator"
            aria-label="Current video frame"
            hidden
          ></output>
          <div
            id="subject-onboarding"
            class="subject-onboarding"
            aria-hidden="true"
          >
            <span class="subject-onboarding-label">
              Drag to select a subject
            </span>
            <span class="subject-onboarding-box"></span>
            <span class="subject-onboarding-cursor"></span>
          </div>
          <div
            id="subject-overlay"
            class="subject-overlay"
            aria-hidden="true"
          >
            <p id="subject-instruction" class="subject-instruction">
              Drag around the subject
            </p>
            <div id="subject-surface" class="subject-surface">
              <div
                id="saved-subject-box"
                class="saved-subject-box"
                hidden
              >
                <span id="saved-subject-label" hidden></span>
              </div>
              <div id="tracking-box" class="tracking-box" hidden></div>
              <div id="subject-box" class="subject-box" hidden>
                <button
                  id="cancel-subject"
                  type="button"
                  class="subject-box-close"
                  aria-label="Cancel subject selection"
                  title="Cancel subject selection"
                >
                </button>
                <span
                  class="subject-handle subject-handle-nw"
                  data-handle="nw"
                ></span>
                <span
                  class="subject-handle subject-handle-ne"
                  data-handle="ne"
                ></span>
                <span
                  class="subject-handle subject-handle-se"
                  data-handle="se"
                ></span>
                <span
                  class="subject-handle subject-handle-sw"
                  data-handle="sw"
                ></span>
              </div>
            </div>
          </div>
        </div>
        <div
          id="frame-step-controls"
          class="frame-step-controls"
          hidden
        >
          <small id="frame-step-help">
            Arrow keys: one frame · Spacebar activates the orange button
          </small>
        </div>
        <div id="subject-picker" class="subject-picker" hidden>
          <div
            id="subject-tracking-actions"
            class="subject-actions subject-tracking-actions"
            hidden
          >
            <div class="tracking-speed-control">
              <span class="tracking-speed-label">
                <label for="tracking-frame-skip">Speed</label>
                <button
                  type="button"
                  class="tooltip-trigger"
                  aria-label="1 times for fast-moving subjects. 10 times for very steady subjects."
                  data-tooltip="1× for fast-moving subjects · 10× for very steady subjects"
                ></button>
              </span>
              <select
                id="tracking-frame-skip"
                aria-label="Speed"
              >
                <option value="1">1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
                <option value="6">6×</option>
                <option value="10">10×</option>
              </select>
            </div>
            <button
              id="follow-subject"
              type="button"
              aria-keyshortcuts="Space"
              aria-label="Track subject (Spacebar)"
              title="Keyboard shortcut: Spacebar"
            >
              Track
            </button>
            <button
              id="stop-following"
              type="button"
              class="control-unavailable"
              aria-keyshortcuts="Space"
              aria-label="Stop here (Spacebar)"
              title="Keyboard shortcut: Spacebar"
              aria-hidden="true"
              disabled
            >
              Stop
            </button>
          </div>
          <div
            id="subject-edit-actions"
            class="subject-actions subject-edit-actions"
            hidden
          >
            <button
              id="confirm-subject"
              type="button"
              aria-keyshortcuts="Space"
              disabled
            >
              Create vertical video
            </button>
          </div>
          <div
            id="tracking-status"
            class="tracking-status"
            role="status"
            hidden
          >
            <span id="tracking-status-message"></span>
            <span
              id="tracking-status-shortcut"
              class="tracking-status-shortcut"
              hidden
            ></span>
          </div>
          <div
            id="tracking-confidence"
            class="tracking-confidence"
            hidden
          >
            <div class="tracking-confidence-heading">
              <span>
                <strong>Confidence</strong>
              </span>
            </div>
            <div class="tracking-confidence-bar">
              <canvas
                id="tracking-confidence-canvas"
                height="32"
                tabindex="0"
                role="slider"
                aria-label="Tracking confidence timeline"
                aria-valuemin="0"
                aria-valuemax="0"
                aria-valuenow="0"
              ></canvas>
              <span
                id="tracking-stabilization-tail"
                class="tracking-stabilization-tail"
                aria-hidden="true"
                hidden
              ></span>
              <span
                id="tracking-confidence-playhead"
                class="tracking-confidence-playhead"
                aria-hidden="true"
                hidden
              ></span>
            </div>
            <div class="tracking-confidence-scale">
              <span id="tracking-confidence-start">00:00.00</span>
              <span id="tracking-confidence-end">00:00.00</span>
            </div>
          </div>
          <label id="subject-jump-row" class="subject-jump-row" hidden>
            <input id="subject-jump" type="checkbox" />
            <span>
              New position
              <small>
                Jump here instead of moving across the previous gap.
              </small>
            </span>
          </label>
          <div
            id="subject-references"
            class="subject-references"
            aria-label="Selected subject frames"
            hidden
          >
            <button
              id="clear-subject"
              type="button"
              class="clear-subject-button"
              aria-label="Clear all subject frames"
              title="Clear all subject frames"
              hidden
            >
            </button>
          </div>
        </div>
      </section>
