      <section id="selection-panel" class="panel" aria-labelledby="selection-heading" hidden>
        <h2 id="selection-heading">3. Choose the segment</h2>

        <div class="time-row">
          <label for="start-time">Start (seconds)</label>
          <input id="start-time" type="number" min="0" step="0.01" value="0" />
          <button id="set-start" type="button" class="secondary">Use playhead</button>
        </div>
        <div class="range-wrap">
          <input
            id="start-range"
            class="range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value="0"
            aria-label="Start time"
          />
          <div
            id="start-keyframes"
            class="keyframe-track"
            aria-hidden="true"
            hidden
          ></div>
        </div>

        <div class="time-row">
          <label for="end-time">End (seconds)</label>
          <input id="end-time" type="number" min="0" step="0.01" value="1" />
          <button id="set-end" type="button" class="secondary">Use playhead</button>
        </div>
        <div class="range-wrap">
          <input
            id="end-range"
            class="range"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value="1"
            aria-label="End time"
          />
          <div
            id="end-keyframes"
            class="keyframe-track"
            aria-hidden="true"
            hidden
          ></div>
        </div>

        <p id="selection-summary" class="summary"></p>
        <p id="keyframe-summary" class="format-summary warning" hidden></p>

        <!-- Fast cut is not currently shown; its existing logic remains active. -->
        <label class="checkbox-row" hidden>
          <input
            id="snap-keyframes"
            type="checkbox"
            role="switch"
            aria-describedby="cut-mode-help"
            checked
            disabled
          />
          <span>
            Fast cut
            <small id="cut-mode-help">
              On: snaps to orange marks and avoids quality loss. Off: uses exact
              timing and takes longer.
            </small>
          </span>
        </label>
      </section>
