      <section
        id="output-preview-panel"
        class="panel"
        aria-labelledby="output-preview-heading"
        hidden
      >
        <h2 id="output-preview-heading">5. Preview</h2>
        <p class="muted">
          Check the selected segment and framing before creating the file.
        </p>
        <div class="output-preview-stage">
          <video
            id="output-preview-media"
            class="output-preview-media"
            preload="auto"
            playsinline
          ></video>
          <canvas
            id="output-preview-canvas"
            aria-label="Video output preview"
            hidden
          ></canvas>
          <output
            id="output-preview-frame-indicator"
            class="output-preview-frame-indicator"
            aria-label="Current output preview frame"
            hidden
          ></output>
        </div>
        <div class="output-preview-controls">
          <button
            id="output-preview-toggle"
            type="button"
            class="secondary"
          >
            Play preview
          </button>
          <input
            id="output-preview-seek"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value="0"
            aria-label="Preview position"
          />
          <output id="output-preview-time">00:00.00 / 00:00.00</output>
        </div>
        <p id="output-preview-note" class="muted output-preview-note">
          This preview uses the original video and does not create a file.
        </p>
        <button id="cut-button" type="button">Cut video</button>
        <button id="cancel-button" type="button" class="secondary" hidden>Cancel</button>
      </section>
