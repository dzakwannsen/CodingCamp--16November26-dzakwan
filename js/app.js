/* ==========================================================================
   Browser Start-Page Dashboard — js/app.js
   All runtime behaviour, state management, and LocalStorage I/O.
   No third-party libraries; Vanilla JavaScript only.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   StorageAdapter
   Wraps every LocalStorage call in try/catch so a quota error or a
   SecurityError (common on file:// in some browsers) surfaces as a
   structured result rather than an uncaught exception.

   Public API:
     get(key)             → string | null
     set(key, value)      → { ok: boolean, error?: string }
     remove(key)          → { ok: boolean, error?: string }
     getJSON(key)         → any | null
     setJSON(key, value)  → { ok: boolean, error?: string }
     init()               → void
   -------------------------------------------------------------------------- */
const StorageAdapter = {
  /**
   * Read a value from LocalStorage.
   * Returns null when the key is absent or an error occurs.
   * @param {string} key
   * @returns {string|null}
   */
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },

  /**
   * Write a string value to LocalStorage.
   * @param {string} key
   * @param {string} value
   * @returns {{ ok: boolean, error?: string }}
   */
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Remove a key from LocalStorage.
   * @param {string} key
   * @returns {{ ok: boolean, error?: string }}
   */
  remove(key) {
    try {
      localStorage.removeItem(key);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Read and JSON-parse a value from LocalStorage.
   * Returns null when the key is absent, on a JSON.parse failure, or on error.
   * @param {string} key
   * @returns {any|null}
   */
  getJSON(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  /**
   * JSON-stringify a value and write it to LocalStorage.
   * @param {string} key
   * @param {any} value
   * @returns {{ ok: boolean, error?: string }}
   */
  setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /**
   * Probe LocalStorage availability by writing, reading, and removing a
   * sentinel key. On failure:
   *   1. Replace all methods with no-op stubs.
   *   2. Render a one-time warning banner (role="alert") in the page.
   */
  init() {
    const SENTINEL_KEY = '__dashboard_storage_probe__';
    const SENTINEL_VAL = '1';
    let available = false;

    try {
      localStorage.setItem(SENTINEL_KEY, SENTINEL_VAL);
      const read = localStorage.getItem(SENTINEL_KEY);
      localStorage.removeItem(SENTINEL_KEY);
      available = (read === SENTINEL_VAL);
    } catch (e) {
      available = false;
    }

    if (!available) {
      // Downgrade all methods to no-op stubs.
      this.get    = (_key)        => null;
      this.set    = (_key, _val)  => ({ ok: false });
      this.remove = (_key)        => ({ ok: false });
      this.getJSON  = (_key)      => null;
      this.setJSON  = (_key, _val) => ({ ok: false });

      // Surface a one-time warning banner.
      this._showStorageWarning();
    }
  },

  /**
   * Render a dismissible warning banner explaining that LocalStorage is
   * unavailable and settings will not persist.
   * @private
   */
  _showStorageWarning() {
    if (document.getElementById('storage-warning-banner')) return; // already shown

    const banner = document.createElement('div');
    banner.id = 'storage-warning-banner';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'z-index:9999',
      'padding:0.75rem 1rem',
      'background:#b71c1c',
      'color:#fff',
      'font-family:sans-serif',
      'font-size:0.9rem',
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:1rem',
    ].join(';');

    const message = document.createElement('span');
    message.textContent =
      '⚠ Storage is unavailable in this browser or origin. ' +
      'Your settings and data will not be saved across page loads.';

    const dismiss = document.createElement('button');
    dismiss.textContent = '✕';
    dismiss.setAttribute('aria-label', 'Dismiss storage warning');
    dismiss.style.cssText = [
      'background:transparent',
      'border:1px solid #fff',
      'color:#fff',
      'cursor:pointer',
      'padding:0.25rem 0.5rem',
      'border-radius:3px',
      'flex-shrink:0',
    ].join(';');
    dismiss.addEventListener('click', () => banner.remove());

    banner.appendChild(message);
    banner.appendChild(dismiss);

    // Insert at the very beginning of <body>, or as the first child of
    // document.documentElement if <body> is not yet available.
    const target = document.body || document.documentElement;
    target.insertBefore(banner, target.firstChild);
  },
};

/* --------------------------------------------------------------------------
   ThemeController
   Reads the stored theme (or OS preference), applies it to <html>, and
   wires the toggle button in #theme-controller.

   Public API:
     init()    → void   reads storage/OS pref, sets data-theme, wires button
     toggle()  → void   flips theme, persists, dispatches 'themechange'
     current() → 'light' | 'dark'
   -------------------------------------------------------------------------- */
const ThemeController = {
  /**
   * Determine the initial theme from storage, OS preference, or default to
   * "light". Apply it to <html> and wire the toggle button.
   */
  init() {
    // The inline zero-FOUC script already set data-theme before first paint;
    // re-read here to ensure the interactive session is in sync.
    const stored = StorageAdapter.get('dashboard_theme');
    let theme;

    if (stored === 'light' || stored === 'dark') {
      theme = stored;
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    } else {
      theme = 'light';
    }

    this._applyTheme(theme);
    this._wireButton();
  },

  /**
   * Flip the current theme, persist it, and notify other widgets via a
   * CustomEvent on document.
   */
  toggle() {
    const next = this.current() === 'light' ? 'dark' : 'light';
    this._applyTheme(next);
    StorageAdapter.set('dashboard_theme', next);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  },

  /**
   * Return the current data-theme value on <html>.
   * @returns {'light' | 'dark'}
   */
  current() {
    const val = document.documentElement.getAttribute('data-theme');
    return val === 'dark' ? 'dark' : 'light';
  },

  /**
   * Set data-theme on <html> and sync aria-pressed on the toggle button.
   * @param {'light' | 'dark'} theme
   * @private
   */
  _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.querySelector('#theme-controller button[data-toggle="theme"]');
    if (btn) {
      btn.setAttribute('aria-pressed', String(theme === 'dark'));
    }
  },

  /**
   * Find the toggle button inside #theme-controller and attach a click
   * listener. If the button does not yet exist in the DOM (widget renders
   * it dynamically), render it first.
   * @private
   */
  _wireButton() {
    const container = document.getElementById('theme-controller');
    if (!container) return;

    let btn = container.querySelector('button[data-toggle="theme"]');

    if (!btn) {
      btn = document.createElement('button');
      btn.setAttribute('data-toggle', 'theme');
      btn.setAttribute('aria-label', 'Toggle light/dark theme');
      btn.setAttribute('aria-pressed', String(this.current() === 'dark'));
      btn.title = 'Toggle theme';

      // Sun SVG (shown in dark mode — clicking switches to light)
      const sunSvg = `<svg class="theme-icon theme-icon--sun" xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>`;

      // Moon SVG (shown in light mode — clicking switches to dark)
      const moonSvg = `<svg class="theme-icon theme-icon--moon" xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>`;

      btn.innerHTML = sunSvg + moonSvg;
      container.appendChild(btn);
    }

    btn.addEventListener('click', () => this.toggle());
  },
};

/* --------------------------------------------------------------------------
   GreetingWidget
   Displays the current time, date, and a personalised greeting message.
   Updates every 60 seconds via setInterval.

   Public API:
     init()     → void   renders immediately, starts 60-second interval
     _render()  → void   updates #greeting-time, #greeting-date, #greeting-message

   Pure helpers (exposed for property-based testing):
     _timeString(date)  → "HH:MM"
     _dateString(date)  → "Day, DD Month YYYY"
     _salutation(h)     → one of four greeting strings
   -------------------------------------------------------------------------- */
const GreetingWidget = {
  /**
   * Return a zero-padded 24-hour time string from a Date object.
   * @param {Date} date
   * @returns {string}  e.g. "09:05"
   */
  _timeString(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    return h + ':' + m;
  },

  /**
   * Return a formatted date string: "Day, DD Month YYYY".
   * @param {Date} date
   * @returns {string}  e.g. "Monday, 20 November 2026"
   */
  _dateString(date) {
    const DAYS = [
      'Sunday', 'Monday', 'Tuesday', 'Wednesday',
      'Thursday', 'Friday', 'Saturday',
    ];
    const MONTHS = [
      'January', 'February', 'March', 'April',
      'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December',
    ];
    const dayName   = DAYS[date.getDay()];
    const day       = String(date.getDate()).padStart(2, '0');
    const monthName = MONTHS[date.getMonth()];
    const year      = date.getFullYear();
    return `${dayName}, ${day} ${monthName} ${year}`;
  },

  /**
   * Map an integer hour (0–23) to one of four greeting strings.
   * [5–11]   → "Good morning"
   * [12–17]  → "Good afternoon"
   * [18–20]  → "Good evening"
   * [21–23] ∪ [0–4] → "Good night"
   * @param {number} h  integer 0–23
   * @returns {string}
   */
  _salutation(h) {
    if (h >= 5 && h <= 11)  return 'Good morning';
    if (h >= 12 && h <= 17) return 'Good afternoon';
    if (h >= 18 && h <= 20) return 'Good evening';
    return 'Good night';
  },

  /**
   * Update the greeting widget DOM: time, date, and personalised greeting.
   * If `new Date()` is unavailable or returns an invalid date, show a
   * placeholder in the time/date slots and omit the greeting (Req 1.10).
   */
  _render() {
    const timeEl    = document.getElementById('greeting-time');
    const dateEl    = document.getElementById('greeting-date');
    const messageEl = document.getElementById('greeting-message');

    let date;
    let dateValid = false;

    try {
      date = new Date();
      dateValid = !isNaN(date.getTime());
    } catch (e) {
      dateValid = false;
    }

    if (!dateValid) {
      // Requirement 1.10 — time unavailable path
      if (timeEl)    timeEl.textContent    = '--:--';
      if (dateEl)    dateEl.textContent    = 'Date unavailable';
      if (messageEl) messageEl.textContent = '';
      return;
    }

    if (timeEl)    timeEl.textContent    = this._timeString(date);
    if (dateEl)    dateEl.textContent    = this._dateString(date);

    if (messageEl) {
      const salutation = this._salutation(date.getHours());
      const name       = StorageAdapter.get('dashboard_username');
      // Req 1.7: append name when present; Req 1.8: omit suffix when absent
      messageEl.textContent = (name && name.length > 0)
        ? salutation + ', ' + name
        : salutation;
    }
  },

  /**
   * Initialise the Greeting Widget:
   * - Render immediately so the display appears within 1 second (Req 1.9)
   * - Start a 60-second interval to keep the clock current (Req 1.1)
   * - Wire the name <form> for save/clear of User_Name (Req 2.1–2.7)
   */
  init() {
    // Render at once so time/date appear before the first tick.
    this._render();

    // Keep the clock updated every 60 seconds.
    setInterval(() => this._render(), 60_000);

    // Wire name form.
    const widget = document.getElementById('greeting-widget');
    if (!widget) return;

    // Apply the 50-character maximum to the name input (Req 2.1).
    const nameInput = widget.querySelector('input[name="username"]');
    if (nameInput) {
      nameInput.setAttribute('maxlength', '50');
    }

    const form = widget.querySelector('form.greeting-name-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const input   = form.querySelector('input[name="username"]');
      const rawVal  = input ? input.value : '';
      const trimmed = rawVal.trim();

      if (trimmed.length > 0) {
        // Req 2.2: persist trimmed value
        StorageAdapter.set('dashboard_username', trimmed);
      } else {
        // Req 2.5 / 2.7: empty or whitespace-only → remove key
        StorageAdapter.remove('dashboard_username');
      }

      // Reflect changes in the greeting immediately.
      this._render();
    });
  },
};

/* --------------------------------------------------------------------------
   TimerWidget
   Configurable Pomodoro focus countdown with audio alert.

   Public API:
     init()     → void
     start()    → void   begins countdown
     stop()     → void   pauses, retains remaining
     reset()    → void   stops and restores full duration
     _tick()    → void   called every second; decrements _remaining
     _complete()→ void   stops timer, plays beep or shows visual fallback
     _beep()    → void   Web Audio API 1-second tone
     _render()  → void   updates DOM display and button states

   Pure helpers (exposed for property-based testing):
     _formatTime(seconds) → "MM:SS"
   -------------------------------------------------------------------------- */
const TimerWidget = {
  /* ---- Widget-scoped state ---- */
  _duration:   25 * 60,   // total seconds (default 25 minutes)
  _remaining:  25 * 60,   // seconds remaining
  _running:    false,
  _intervalId: null,

  /**
   * Convert a total-seconds integer to a zero-padded "MM:SS" string.
   * @param {number} seconds  non-negative integer
   * @returns {string}  e.g. 90 → "01:30", 1500 → "25:00", 0 → "00:00"
   */
  _formatTime(seconds) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    return mm + ':' + ss;
  },

  /**
   * Start the countdown from the current remaining time.
   * Does nothing if already running.
   * Requirements: 3.2, 3.7
   */
  start() {
    if (this._running) return;
    this._running    = true;
    this._intervalId = setInterval(() => this._tick(), 1000);
    this._render();
  },

  /**
   * Pause the countdown, retaining the remaining time.
   * Requirements: 3.3, 3.8
   */
  stop() {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._running = false;
    this._render();
  },

  /**
   * Stop any active countdown and restore the full duration.
   * Requirements: 3.4
   */
  reset() {
    this.stop();
    this._remaining = this._duration;
    this._render();
  },

  /**
   * Called every second while running.
   * Decrements _remaining by 1; triggers _complete() when it reaches 0.
   * Requirements: 3.2, 3.5
   * @private
   */
  _tick() {
    this._remaining -= 1;
    this._render();
    if (this._remaining <= 0) {
      this._complete();
    }
  },

  /**
   * Stop the timer and play an audible alert.
   * Falls back to a visual indicator if Web Audio is unavailable.
   * Requirements: 3.5, 3.6
   * @private
   */
  _complete() {
    this.stop();
    try {
      this._beep();
    } catch (e) {
      // Web Audio API unavailable or blocked — visual fallback.
      const display = document.getElementById('timer-display');
      if (display) display.classList.add('timer-complete');
    }
  },

  /**
   * Emit a 1-second 880 Hz sine tone via the Web Audio API.
   * The whole function is wrapped so callers can safely catch failures.
   * Requirements: 3.5
   * @private
   */
  _beep() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      osc.type      = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1);
      // Close the context after the tone finishes to free resources.
      osc.onended = () => { try { ctx.close(); } catch (_) {} };
    } catch (e) {
      throw e; // re-throw so _complete() catches it and shows visual fallback
    }
  },

  /**
   * Update the timer display element and control button states to match the
   * current widget state.
   * Requirements: 3.7, 3.8
   * @private
   */
  _render() {
    const display   = document.getElementById('timer-display');
    const btnStart  = document.getElementById('timer-start');
    const btnStop   = document.getElementById('timer-stop');
    const btnReset  = document.getElementById('timer-reset');

    if (display) {
      display.textContent = this._formatTime(this._remaining);
      // Remove completion indicator if the timer has been reset.
      if (this._remaining > 0) {
        display.classList.remove('timer-complete');
      }
    }

    // Req 3.7: while running, Start is disabled; Stop is enabled.
    // Req 3.8: while stopped/paused, Start is enabled; Stop is disabled.
    if (btnStart) btnStart.disabled = this._running;
    if (btnStop)  btnStop.disabled  = !this._running;
    // Reset is always enabled per design spec.
    if (btnReset) btnReset.disabled = false;
  },

  /**
   * Validate the given minutes value, persist it, and apply it to the timer
   * state according to whether a session is in progress.
   *
   * Validation rules (Requirements 4.1, 4.4):
   *   - `min` must parse to an integer (parseInt result equals the input value)
   *   - The parsed value must be in [1, 120] inclusive
   *
   * On validation failure:
   *   - Inject an error message into #timer-duration-error
   *   - Return without persisting or modifying any state
   *
   * On success (Requirements 4.2, 4.5, 4.6, 3.9):
   *   - Clear the error span
   *   - Persist String(min) under 'dashboard_pomodoro_duration' (always, even
   *     when a session is active — Req 4.6)
   *   - If the timer is truly idle (!_running AND _remaining === current
   *     _duration), update _duration and _remaining then call _render() so the
   *     display reflects the new setting immediately (Req 4.5)
   *   - If a session is in progress (_running OR _remaining < _duration),
   *     update only _duration so the next reset/new-session uses the new value,
   *     but leave _remaining and _running untouched (Req 3.9, 4.6)
   *
   * @param {number} min  value from the duration input (may be NaN)
   * Requirements: 3.9, 4.1, 4.2, 4.4, 4.5, 4.6
   */
  _saveDuration(min) {
    const errorEl = document.getElementById('timer-duration-error');

    // ── Validation ───────────────────────────────────────────────────────────
    const parsed = parseInt(min, 10);

    if (isNaN(parsed) || parsed !== Number(min)) {
      if (errorEl) errorEl.textContent = 'Duration must be a whole number.';
      return;
    }

    if (parsed < 1 || parsed > 120) {
      if (errorEl) errorEl.textContent = 'Duration must be between 1 and 120 minutes.';
      return;
    }

    // ── Success path ─────────────────────────────────────────────────────────
    if (errorEl) errorEl.textContent = '';

    // Always persist — Req 4.2, 4.6
    StorageAdapter.set('dashboard_pomodoro_duration', String(parsed));

    const newDurationSeconds = parsed * 60;
    const wasIdle = !this._running && this._remaining === this._duration;

    // Update the internal duration reference.
    this._duration = newDurationSeconds;

    if (wasIdle) {
      // Truly idle: sync display to new duration — Req 4.5
      this._remaining = newDurationSeconds;
      this._render();
    }
    // If a session is active, _remaining and _running are intentionally
    // left unchanged — Req 3.9, 4.6
  },

  /**
   * Load stored duration, initialise state, render, and wire all controls.
   * Requirements: 4.3, 3.7, 3.8, 4.1
   */
  init() {
    // Load persisted duration; default to 25 minutes if absent/invalid (Req 4.3).
    const stored = StorageAdapter.get('dashboard_pomodoro_duration');
    const parsed = stored ? parseInt(stored, 10) : NaN;
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 120) {
      this._duration  = parsed * 60;
    }
    this._remaining = this._duration;

    // Sync the duration input to the loaded value (Req 4.3).
    const durationInput = document.getElementById('timer-duration-input');
    if (durationInput) {
      durationInput.value = String(this._duration / 60);
    }

    // Initial render to populate the display.
    this._render();

    // Wire Start / Stop / Reset buttons.
    const btnStart = document.getElementById('timer-start');
    const btnStop  = document.getElementById('timer-stop');
    const btnReset = document.getElementById('timer-reset');

    if (btnStart) btnStart.addEventListener('click', () => this.start());
    if (btnStop)  btnStop.addEventListener('click',  () => this.stop());
    if (btnReset) btnReset.addEventListener('click', () => this.reset());

    // Wire duration Save button and Enter key on the duration input (Req 4.1, 4.2).
    const btnSaveDuration = document.getElementById('timer-duration-save');

    if (btnSaveDuration && durationInput) {
      btnSaveDuration.addEventListener('click', () => {
        this._saveDuration(parseInt(durationInput.value, 10));
      });

      durationInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._saveDuration(parseInt(durationInput.value, 10));
        }
      });
    }
  },
};

/* --------------------------------------------------------------------------
   TodoWidget
   Full-lifecycle task management backed by LocalStorage.

   Public API:
     init()                      → void
     _load()                     → Task[]
     _save(tasks)                → void
     _add(label)                 → void
     _toggle(id)                 → void
     _beginEdit(id)              → void
     _commitEdit(id, label)      → void
     _delete(id)                 → void
     _render()                   → void
   -------------------------------------------------------------------------- */
const TodoWidget = {
  /** @type {Array<{id: string, label: string, completed: boolean}>} */
  _tasks: [],

  /**
   * Load tasks from LocalStorage.
   * Returns the parsed array when present and valid, or [] otherwise.
   * @returns {Array<{id: string, label: string, completed: boolean}>}
   */
  _load() {
    const data = StorageAdapter.getJSON('dashboard_tasks');
    if (!Array.isArray(data)) return [];
    return data;
  },

  /**
   * Persist the tasks array to LocalStorage.
   * On failure, renders an inline error banner inside #todo-widget and
   * leaves the in-memory _tasks array untouched (Req 5.10).
   * @param {Array<{id: string, label: string, completed: boolean}>} tasks
   */
  _save(tasks) {
    const result = StorageAdapter.setJSON('dashboard_tasks', tasks);
    if (!result.ok) {
      this._showSaveError(result.error);
    }
  },

  /**
   * Generate a unique task identifier.
   * Uses crypto.randomUUID() where available; falls back to a
   * millisecond-timestamp + random-suffix string.
   * @returns {string}
   * @private
   */
  _generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now() + '-' + Math.random().toString(36).slice(2);
  },

  /**
   * Add a new task.
   * Trims the label; validates 1–150 chars. On failure injects an error
   * message into the `.todo-field-error` span and does NOT create a task.
   * On success creates a task, appends it to _tasks, persists, and re-renders.
   * Requirements: 5.2, 5.3
   * @param {string} label  raw label value from the input
   */
  _add(label) {
    const trimmed = label.trim();
    const errorEl = document.querySelector('#todo-widget .todo-field-error');

    if (trimmed.length === 0) {
      if (errorEl) errorEl.textContent = 'Task label cannot be empty.';
      return;
    }

    if (trimmed.length > 150) {
      if (errorEl) errorEl.textContent = 'Task label must be 150 characters or fewer.';
      return;
    }

    // Clear any previous validation message.
    if (errorEl) errorEl.textContent = '';

    const task = {
      id:        this._generateId(),
      label:     trimmed,
      completed: false,
    };

    this._tasks.push(task);
    this._save(this._tasks);
    this._render();
  },

  /**
   * Toggle the completed state of a task identified by id.
   * Requirements: 5.4
   * @param {string} id  task identifier
   */
  _toggle(id) {
    const task = this._tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    task.completed = !task.completed;
    this._save(this._tasks);
    this._render();
  },

  /**
   * Remove a task identified by id from the list.
   * Requirements: 5.8
   * @param {string} id  task identifier
   */
  _delete(id) {
    this._tasks = this._tasks.filter(function (t) { return t.id !== id; });
    this._save(this._tasks);
    this._render();
  },

  /**
   * Enter inline-edit mode for a task.
   * Replaces the label <span> inside the task's <li> with an <input type="text">
   * pre-filled with the current label, then focuses it.
   * Requirements: 5.5
   * @param {string} id  task identifier
   */
  _beginEdit(id) {
    const list = document.getElementById('todo-list');
    if (!list) return;

    const li = list.querySelector('li[data-id="' + id + '"]');
    if (!li) return;

    const span = li.querySelector('.todo-label');
    if (!span) return;

    const task = this._tasks.find(function (t) { return t.id === id; });
    if (!task) return;

    const input = document.createElement('input');
    input.type      = 'text';
    input.className = 'todo-edit-input';
    input.value     = task.label;
    input.setAttribute('maxlength', '150');
    input.setAttribute('aria-label', 'Edit task: ' + task.label);

    // Track whether a commit has already been triggered so blur doesn't
    // fire a second time after Enter/Escape handling.
    let committed = false;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        committed = true;
        this._commitEdit(id, input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        committed = true;
        this._render();
      }
    });

    input.addEventListener('blur', () => {
      if (!committed) {
        committed = true;
        this._commitEdit(id, input.value);
      }
    });

    span.replaceWith(input);
    input.focus();
  },

  /**
   * Commit an inline edit for a task.
   * Trims the label; discards the edit (restores DOM) if empty.
   * On a valid trimmed label (1–150 chars), updates the task, saves, and re-renders.
   * Requirements: 5.5, 5.6, 5.7
   * @param {string} id     task identifier
   * @param {string} label  raw value from the edit input
   */
  _commitEdit(id, label) {
    const trimmed = label.trim();

    // Req 5.7: empty or whitespace-only → discard, restore original
    if (trimmed.length === 0) {
      this._render();
      return;
    }

    // Req 5.6: too long → discard (treat as invalid, restore original)
    if (trimmed.length > 150) {
      this._render();
      return;
    }

    // Req 5.5, 5.6: valid → update label, persist, re-render
    const task = this._tasks.find(function (t) { return t.id === id; });
    if (!task) {
      this._render();
      return;
    }

    task.label = trimmed;
    this._save(this._tasks);
    this._render();
  },

  /**
   * Rebuild the full task list DOM from the in-memory _tasks array.
   * Tasks are rendered in array order, preserving insertion order (Req 5.9).
   * Each <li data-id="…"> receives a "completed" class when task.completed
   * is true, triggering the strikethrough style via CSS (Req 5.1).
   * @private
   */
  _render() {
    const list = document.getElementById('todo-list');
    if (!list) return;

    list.innerHTML = '';

    this._tasks.forEach(function (task) {
      const li = document.createElement('li');
      li.dataset.id = task.id;
      // Req 5.1: apply a visual style so completed tasks are visually distinct.
      if (task.completed) li.classList.add('completed');

      // Completion checkbox.
      const checkbox = document.createElement('input');
      checkbox.type    = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', 'Mark "' + task.label + '" as ' +
        (task.completed ? 'incomplete' : 'complete'));
      checkbox.addEventListener('change', function () {
        TodoWidget._toggle(task.id);
      });

      // Label span.
      const span = document.createElement('span');
      span.className   = 'todo-label';
      span.textContent = task.label;

      // Edit button.
      const editBtn = document.createElement('button');
      editBtn.type        = 'button';
      editBtn.className   = 'todo-edit';
      editBtn.textContent = 'Edit';
      editBtn.setAttribute('aria-label', 'Edit task: ' + task.label);
      editBtn.addEventListener('click', function () {
        TodoWidget._beginEdit(task.id);
      });

      // Delete button.
      const delBtn = document.createElement('button');
      delBtn.type        = 'button';
      delBtn.className   = 'todo-delete';
      delBtn.textContent = 'Delete';
      delBtn.setAttribute('aria-label', 'Delete task: ' + task.label);
      delBtn.addEventListener('click', function () {
        TodoWidget._delete(task.id);
      });

      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(editBtn);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  },

  /**
   * Render a dismissible error banner inside #todo-widget indicating the
   * save failed. Only one banner is shown at a time.
   * @param {string} [errorMessage]
   * @private
   */
  _showSaveError(errorMessage) {
    const widget = document.getElementById('todo-widget');
    if (!widget) return;

    // Remove any existing banner first to avoid stacking duplicates.
    const existing = widget.querySelector('.todo-save-error');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'todo-save-error';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');

    const msg = document.createElement('span');
    msg.textContent = '⚠ Could not save tasks. Changes may be lost on reload.' +
      (errorMessage ? ' (' + errorMessage + ')' : '');

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss save error');
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', () => banner.remove());

    banner.appendChild(msg);
    banner.appendChild(dismiss);

    // Insert at the top of the widget content area.
    const content = widget.querySelector('.todo-content') || widget;
    content.insertBefore(banner, content.firstChild);
  },

  /**
   * Initialise the TodoWidget: load persisted tasks, render, and wire the
   * add-task form.
   * Requirements: 5.1
   */
  init() {
    this._tasks = this._load();
    this._render();

    const form = document.querySelector('#todo-widget .todo-add-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('input[name="todo_label"]');
      if (!input) return;
      this._add(input.value);
      // Clear the input only on success (error leaves it populated for correction).
      const errorEl = form.querySelector('.todo-field-error');
      if (!errorEl || errorEl.textContent === '') {
        input.value = '';
      }
    });
  },
};

/* --------------------------------------------------------------------------
   LinksWidget
   Quick-launch shortcut management backed by LocalStorage.

   Public API:
     init()                    → void
     _load()                   → QuickLink[]
     _save(links)              → void
     _normaliseUrl(url)        → string
     _add(label, url)          → void
     _delete(id)               → void
     _render()                 → void
   -------------------------------------------------------------------------- */
const LinksWidget = {
  /** @type {Array<{id: string, label: string, url: string}>} */
  _links: [],

  /**
   * Load quick links from LocalStorage.
   * Returns the parsed array when present and valid.
   * On null result or non-array data (storage unavailable or parse failure),
   * renders an error banner inside #links-widget and returns [].
   * @returns {Array<{id: string, label: string, url: string}>}
   */
  _load() {
    const data = StorageAdapter.getJSON('dashboard_links');
    if (Array.isArray(data)) return data;

    // Req 6.8: storage unavailable or data cannot be parsed as a list of QuickLinks
    this._showLoadError();
    return [];
  },

  /**
   * Persist the links array to LocalStorage.
   * On failure, renders an inline error banner inside #links-widget indicating
   * the change could not be saved. Does NOT update the displayed links list
   * (does not call _render()). (Req 6.9)
   * @param {Array<{id: string, label: string, url: string}>} links
   */
  _save(links) {
    const result = StorageAdapter.setJSON('dashboard_links', links);
    if (!result.ok) {
      this._showSaveError(result.error);
    }
  },

  /**
   * Generate a unique link identifier.
   * Uses crypto.randomUUID() where available; falls back to a
   * millisecond-timestamp + random-suffix string.
   * @returns {string}
   * @private
   */
  _generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now() + '-' + Math.random().toString(36).slice(2);
  },

  /**
   * Normalise a URL by prepending 'https://' if no http(s) scheme is present.
   * The check is case-insensitive; the rest of the string is preserved verbatim.
   * Requirements: 6.5
   * @param {string} url
   * @returns {string}
   */
  _normaliseUrl(url) {
    if (/^https?:\/\//i.test(url)) return url;
    return 'https://' + url;
  },

  /**
   * Add a new Quick Link.
   * Trims label and url; validates both fields and the 50-item cap.
   * On validation failure injects an error message into `.links-field-error`
   * and returns early without modifying state.
   * On success normalises the URL, creates a QuickLink, persists, and re-renders.
   * Requirements: 6.2, 6.5, 6.6
   * @param {string} label  raw label value
   * @param {string} url    raw url value
   */
  _add(label, url) {
    const trimmedLabel = label.trim();
    const trimmedUrl   = url.trim();
    const errorEl      = document.querySelector('#links-widget .links-field-error');

    if (trimmedLabel.length === 0) {
      if (errorEl) errorEl.textContent = 'Link label cannot be empty.';
      return;
    }

    if (trimmedLabel.length > 100) {
      if (errorEl) errorEl.textContent = 'Link label must be 100 characters or fewer.';
      return;
    }

    if (trimmedUrl.length === 0) {
      if (errorEl) errorEl.textContent = 'URL cannot be empty.';
      return;
    }

    if (trimmedUrl.length > 2048) {
      if (errorEl) errorEl.textContent = 'URL must be 2048 characters or fewer.';
      return;
    }

    if (this._links.length >= 50) {
      if (errorEl) errorEl.textContent = 'Maximum of 50 links reached.';
      return;
    }

    // Clear any previous validation message.
    if (errorEl) errorEl.textContent = '';

    const link = {
      id:    this._generateId(),
      label: trimmedLabel,
      url:   this._normaliseUrl(trimmedUrl),
    };

    this._links.push(link);
    this._save(this._links);
    this._render();
  },

  /**
   * Remove a Quick Link identified by id from the list.
   * Only updates the displayed list if the save succeeds.
   * Requirements: 6.4
   * @param {string} id  link identifier
   */
  _delete(id) {
    const updated = this._links.filter(function (l) { return l.id !== id; });
    const result  = StorageAdapter.setJSON('dashboard_links', updated);
    if (!result.ok) {
      this._showSaveError(result.error);
      return; // Req 6.9: do NOT update displayed list on save failure
    }
    this._links = updated;
    this._render();
  },

  /**
   * Rebuild the full links button list in #links-list from the in-memory
   * _links array. Links are rendered in insertion order (Req 6.7).
   * Each <li data-id="…"> contains a launch button and a delete button.
   * Requirements: 6.1, 6.3, 6.7
   * @private
   */
  _render() {
    const list = document.getElementById('links-list');
    if (!list) return;

    list.innerHTML = '';

    this._links.forEach(function (link) {
      const li = document.createElement('li');
      li.dataset.id = link.id;

      // Launch button — opens the URL in a new tab (Req 6.3).
      const launchBtn = document.createElement('button');
      launchBtn.type        = 'button';
      launchBtn.className   = 'links-launch';
      launchBtn.textContent = link.label;
      launchBtn.setAttribute('aria-label', 'Open ' + link.label);
      launchBtn.addEventListener('click', function () {
        window.open(link.url, '_blank');
      });

      // Delete button — removes the link (Req 6.4).
      const delBtn = document.createElement('button');
      delBtn.type        = 'button';
      delBtn.className   = 'links-delete';
      delBtn.textContent = 'Delete';
      delBtn.setAttribute('aria-label', 'Delete link: ' + link.label);
      delBtn.addEventListener('click', function () {
        LinksWidget._delete(link.id);
      });

      li.appendChild(launchBtn);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  },

  /**
   * Initialise the LinksWidget: load persisted links, render, and wire the
   * add-link form.
   * Requirements: 6.1
   */
  init() {
    this._links = this._load();
    this._render();

    const form = document.querySelector('#links-widget .links-add-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const labelInput = form.querySelector('input[name="link_label"]');
      const urlInput   = form.querySelector('input[name="link_url"]');
      if (!labelInput || !urlInput) return;

      const prevCount = this._links.length;
      this._add(labelInput.value, urlInput.value);

      // Clear inputs only on success (link count increased means _add succeeded).
      if (this._links.length > prevCount) {
        labelInput.value = '';
        urlInput.value   = '';
      }
    });
  },

  /**
   * Render a dismissible error banner inside #links-widget indicating that
   * links could not be loaded from storage.
   * Only one load-error banner is shown at a time.
   * @private
   */
  _showLoadError() {
    const widget = document.getElementById('links-widget');
    if (!widget) return;

    // Remove any existing load-error banner to avoid duplicates.
    const existing = widget.querySelector('.links-load-error');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.className = 'links-load-error';
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');

    const msg = document.createElement('span');
    msg.textContent = '⚠ Links could not be loaded. Stored data may be corrupted.';

    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss load error');
    dismiss.textContent = '✕';
    dismiss.addEventListener('click', () => banner.remove());

    banner.appendChild(msg);
    banner.appendChild(dismiss);

    const content = widget.querySelector('.links-content') || widget;
    content.insertBefore(banner, content.firstChild);
  },

  /**
   * Render a dismissible error banner inside #links-widget indicating that
   * a save operation failed. Only one save-error banner is shown at a time.
   * @param {string} [errorMessage]
   * @private
   */
};

/* --------------------------------------------------------------------------
   DOMContentLoaded — Widget initialisation sequence
   Order per design spec: StorageAdapter → ThemeController → GreetingWidget
   → TimerWidget → TodoWidget → LinksWidget
   Each widget is guarded in its own try/catch so one failure does not block
   subsequent widgets from initialising.
   Requirements: 8.2, 8.5
   -------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  try { StorageAdapter.init();    } catch (e) { console.error('StorageAdapter.init failed', e); }
  try { ThemeController.init();  } catch (e) { console.error('ThemeController.init failed', e); }
  try { GreetingWidget.init();   } catch (e) { console.error('GreetingWidget.init failed', e); }
  try { TimerWidget.init();      } catch (e) { console.error('TimerWidget.init failed', e); }
  try { TodoWidget.init();       } catch (e) { console.error('TodoWidget.init failed', e); }
  try { LinksWidget.init();      } catch (e) { console.error('LinksWidget.init failed', e); }
});
