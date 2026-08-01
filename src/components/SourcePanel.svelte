      <section class="panel" aria-labelledby="source-heading">
        <h2 id="source-heading">1. Choose a video</h2>
        <label class="file-picker">
          <span>Video file</span>
          <input id="file-input" type="file" accept="video/*" />
        </label>
        <p id="file-details" class="muted">No video selected.</p>
        <p id="format-summary" class="format-summary" hidden></p>
        <div id="reencode-suggestion" class="reencode-suggestion" hidden>
          <div class="reencode-heading">
            <strong>Suggested FFmpeg command</strong>
            <a
              id="ffmpeg-download-link"
              href="https://ffmpeg.org/download.html"
              target="_blank"
              rel="noopener noreferrer"
            >Get FFmpeg</a>
          </div>
          <div class="reencode-command-wrap">
            <code id="reencode-command"></code>
            <button
              id="copy-reencode-command"
              type="button"
              class="secondary icon-button reencode-copy"
              aria-label="Copy FFmpeg command"
              title="Copy FFmpeg command"
            ></button>
          </div>
          <small id="reencode-copy-status" role="status" aria-live="polite"></small>
        </div>
      </section>
