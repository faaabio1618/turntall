      <section
        id="output-options-panel"
        class="panel"
        aria-labelledby="output-options-heading"
        hidden
      >
        <h2 id="output-options-heading">4. Output</h2>
        <label class="checkbox-row">
          <input
            id="vertical-mode"
            type="checkbox"
            aria-describedby="vertical-help"
          />
          <span>
            9:16 vertical video
            <small id="vertical-help">
              Keeps the center of the frame.
            </small>
          </span>
        </label>
        <label class="checkbox-row">
          <input
            id="keep-audio"
            type="checkbox"
            aria-describedby="audio-help"
            checked
          />
          <span>
            Keep audio
            <small id="audio-help">
              Turn this off to create a silent video.
            </small>
          </span>
        </label>
        <label class="output-speed-control" for="video-speed">
          <span class="output-speed-heading">
            <span>Video speed</span>
            <output id="video-speed-value" for="video-speed">1×</output>
          </span>
          <input
            id="video-speed"
            type="range"
            min="0.5"
            max="3"
            step="0.25"
            value="1"
          />
        </label>
        <p id="crop-summary" class="summary muted" hidden></p>
      </section>
