    <dialog
      id="browser-gate"
      class="browser-gate"
      aria-labelledby="browser-gate-title"
      aria-describedby="browser-gate-copy"
    >
      <div class="confirmation-dialog">
        <p class="browser-gate-label">Browser not supported</p>
        <h2 id="browser-gate-title">Open this page in Google Chrome</h2>
        <p id="browser-gate-copy">
          This video editor requires Google Chrome. To start using it, copy
          this page's address and open it in Chrome.
        </p>
        <div class="confirmation-dialog-actions">
          <a
            class="button-link"
            href="https://www.google.com/chrome/"
            rel="noreferrer"
          >
            Get Google Chrome
          </a>
        </div>
      </div>
    </dialog>
    <dialog
      id="clear-subject-dialog"
      aria-labelledby="clear-subject-dialog-title"
    >
      <form method="dialog" class="confirmation-dialog">
        <h2 id="clear-subject-dialog-title">Clear all subject boxes?</h2>
        <p>
          This removes every selected and automatically tracked subject box.
        </p>
        <div class="confirmation-dialog-actions">
          <button value="cancel" type="submit" class="secondary">
            Cancel
          </button>
          <button value="clear" type="submit" class="danger">
            Clear all
          </button>
        </div>
      </form>
    </dialog>

    <dialog
      id="replace-video-dialog"
      aria-labelledby="replace-video-dialog-title"
    >
      <form method="dialog" class="confirmation-dialog">
        <h2 id="replace-video-dialog-title">Replace this video?</h2>
        <p>Saved subject frames will be lost.</p>
        <div class="confirmation-dialog-actions">
          <button value="cancel" type="submit" class="secondary">
            Cancel
          </button>
          <button value="replace" type="submit" class="danger">
            Replace video
          </button>
        </div>
      </form>
    </dialog>

    <dialog
      id="later-subject-dialog"
      aria-labelledby="later-subject-dialog-title"
    >
      <form method="dialog" class="confirmation-dialog">
        <h2 id="later-subject-dialog-title">Delete later subject boxes?</h2>
        <p id="later-subject-dialog-copy">
          Changing this frame may make the later subject positions inaccurate.
        </p>
        <div class="confirmation-dialog-actions">
          <button value="keep" type="submit" class="secondary">
            Keep later boxes
          </button>
          <button value="delete" type="submit" class="danger">
            Delete later boxes
          </button>
        </div>
      </form>
    </dialog>

    <dialog
      id="restart-tracking-dialog"
      aria-labelledby="restart-tracking-dialog-title"
    >
      <form method="dialog" class="confirmation-dialog">
        <h2 id="restart-tracking-dialog-title">
          Restart tracking from this frame?
        </h2>
        <p id="restart-tracking-dialog-copy">
          Tracking already reaches a later frame.
        </p>
        <div class="confirmation-dialog-actions">
          <button value="continue" type="submit" class="secondary">
            Continue existing tracking
          </button>
          <button value="redraw" type="submit">Redraw this frame</button>
        </div>
      </form>
    </dialog>
