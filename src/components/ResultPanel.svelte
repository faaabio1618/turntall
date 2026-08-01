      <section id="result-panel" class="panel" aria-live="polite" hidden>
        <h2>6. Result</h2>
        <p id="status">Ready.</p>
        <ol
          id="processing-steps"
          class="processing-steps"
          aria-label="Video creation steps"
          hidden
        >
          <li id="processing-step-prepare" class="processing-step">
            <span class="processing-step-marker" aria-hidden="true">1</span>
            <span class="processing-step-copy">
              <strong>Load the source video</strong>
              <span id="processing-step-prepare-detail">Waiting</span>
            </span>
          </li>
          <li id="processing-step-process" class="processing-step">
            <span class="processing-step-marker" aria-hidden="true">2</span>
            <span class="processing-step-copy">
              <strong id="processing-step-process-label">
                Cut the selected clip
              </strong>
              <span id="processing-step-process-detail">Waiting</span>
            </span>
          </li>
          <li id="processing-step-finalize" class="processing-step">
            <span class="processing-step-marker" aria-hidden="true">3</span>
            <span class="processing-step-copy">
              <strong>Finish the video and prepare the download</strong>
              <span id="processing-step-finalize-detail">Waiting</span>
            </span>
          </li>
        </ol>
        <progress
          id="progress"
          value="0"
          max="1"
          aria-label="Current step progress"
          hidden
        ></progress>
        <p id="time-estimate" class="time-estimate muted" hidden>
          Estimating time remaining…
        </p>
        <div id="download-controls" class="download-controls" hidden>
          <label for="output-filename">
            <span>File name</span>
            <input
              id="output-filename"
              type="text"
              autocomplete="off"
              spellcheck="false"
            />
          </label>
          <a id="download-link" class="button-link" hidden>Download</a>
        </div>
      </section>
