// protect.js
(function () {
  'use strict';

  /**
   * CONFIG
   * - ORIGIN: your homepage origin (optional). If null, it will be derived from current origin.
   * - TOKEN_KEY: sessionStorage key used by index.html to mark allowed entry.
   * - TOKEN_MAX_AGE: seconds - how long token is valid after being created (0 = no expiry)
   * - DEVTOOLS_THRESHOLD: pixel difference threshold to detect devtools (tweak if false positives)
   */
  const ORIGIN = null; // e.g. "https://alifo.vercel.app" or null to auto-detect
  const TOKEN_KEY = 'enteredFromHome_v2';
  const TOKEN_TIME_KEY = 'enteredFromHome_time_v2';
  const TOKEN_MAX_AGE = 60 * 60 * 2; // 2 hours (0 = never expire)
  const DEVTOOLS_THRESHOLD = 160; // px difference to detect devtools (adjust if needed)
  const REDIRECT_PAGE = 'index.html';
  const SHOW_WARN = false; // set true to alert on blocked actions (can be annoying)

  // ---------- Utility helpers ----------
  function nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }

  function getOrigin() {
    if (ORIGIN) return ORIGIN.replace(/\/+$/, '');
    return (location.protocol + '//' + location.host).replace(/\/+$/, '');
  }

  function isValidToken() {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) return false;
      if (!TOKEN_MAX_AGE || TOKEN_MAX_AGE <= 0) return true;
      const t = parseInt(sessionStorage.getItem(TOKEN_TIME_KEY) || '0', 10);
      if (!t) return false;
      return nowSeconds() - t <= TOKEN_MAX_AGE;
    } catch (e) {
      return false;
    }
  }

  function computeIndexRelativePath() {
    // Determine how many levels up we need to go to reach site root
    // Example: /yr1/pt.html -> ["yr1","pt.html"] -> depth = 2 -> goUp = "../".repeat(1)
    const parts = location.pathname.split('/').filter(Boolean);
    const depth = Math.max(0, parts.length - 1);
    const goUp = '../'.repeat(depth);
    return goUp + REDIRECT_PAGE;
  }

  function redirectHome() {
    try {
      const target = computeIndexRelativePath();
      location.replace(target);
    } catch (e) {
      // fallback absolute
      location.replace(getOrigin() + '/' + REDIRECT_PAGE);
    }
  }

  // ---------- Protection checks ----------
  function passedEntryChecks() {
    // 1) session token set by index.html
    if (isValidToken()) return true;

    // 2) fallback to referrer check (weak, but helpful for some cases)
    const ref = document.referrer || '';
    const origin = getOrigin();
    if (ref.startsWith(origin + '/' ) || ref === origin) return true;

    // 3) Another fallback: referrer includes index filename explicitly
    if (ref.includes('/' + REDIRECT_PAGE)) return true;

    return false;
  }

  // ---------- Hardening behaviors ----------
  function blockContextMenu(e) {
    e.preventDefault();
    if (SHOW_WARN) alert('Right click has been disabled.');
  }

  function blockKeys(e) {
    // Normalize key values
    const k = (e.key || '').toLowerCase();

    // Block F12
    if (e.key === 'F12') {
      e.preventDefault(); e.stopPropagation();
      if (SHOW_WARN) alert('Blocked.');
      return;
    }

    // Block Ctrl/Cmd + Shift + I / J / C (inspect / console / inspect element)
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) {
      e.preventDefault(); e.stopPropagation();
      if (SHOW_WARN) alert('Blocked.');
      return;
    }

    // Block Ctrl/Cmd + U (view-source)
    if ((e.ctrlKey || e.metaKey) && k === 'u') {
      e.preventDefault(); e.stopPropagation();
      if (SHOW_WARN) alert('Blocked.');
      return;
    }

    // Block Ctrl/Cmd + S (save)
    if ((e.ctrlKey || e.metaKey) && k === 's') {
      e.preventDefault(); e.stopPropagation();
      if (SHOW_WARN) alert('Saving disabled.');
      return;
    }
  }

  function preventCopyCutPaste(e) {
    e.preventDefault();
    if (SHOW_WARN) alert('Copy/paste is disabled on this page.');
  }

  function preventDragStart(e) {
    e.preventDefault();
  }

  function disableSelectionStyles() {
    try {
      const css = document.createElement('style');
      css.type = 'text/css';
      css.appendChild(document.createTextNode(`
        * { -webkit-user-select: none !important; -moz-user-select: none !important; -ms-user-select: none !important; user-select: none !important; }
        html, body { -webkit-touch-callout: none !important; }
      `));
      document.head && document.head.appendChild(css);
    } catch (e) { /* ignore */ }
  }

  // ---------- DevTools detection ----------
  let devtoolsOpened = false;
  function checkDevTools() {
    try {
      const threshold = DEVTOOLS_THRESHOLD; // px
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > threshold || heightDiff > threshold) {
        devtoolsOpened = true;
        // immediate redirect to homepage if detected
        redirectHome();
      }
    } catch (e) { /* ignore */ }
  }

  // A second detection using debugger timing (optional)
  function detectDevToolsByDebugger() {
    let start = Date.now();
    // Looped debugger is detectable by measuring time to execute "debugger" slash pauses.
    // This is noisy and may trigger false positives on slow devices; commented out by default.
    // if (Date.now() - start > 200) redirectHome();
  }

  // ---------- Initialization & binding ----------
  function initProtection() {
    // If checks fail, redirect immediately
    if (!passedEntryChecks()) {
      redirectHome();
      return;
    }

    // Setup selection/blocking
    disableSelectionStyles();
    document.addEventListener('contextmenu', blockContextMenu, { capture: true });
    document.addEventListener('keydown', blockKeys, { capture: true });
    document.addEventListener('copy', preventCopyCutPaste, { capture: true });
    document.addEventListener('cut', preventCopyCutPaste, { capture: true });
    document.addEventListener('paste', preventCopyCutPaste, { capture: true });
    document.addEventListener('dragstart', preventDragStart, { capture: true });

    // Additional: remove right-click via onmousedown as fallback for some browsers
    document.onmousedown = function (e) {
      if (e && e.button === 2) {
        e.preventDefault();
        return false;
      }
    };

    // Periodically check for devtools open
    setInterval(checkDevTools, 1000);

    // Extra: try to clear referrer when user leaves to reduce usability of back/forward used to bypass
    // Note: cannot reliably change document.referrer, but we can attempt to replace history entry
    try {
      history.replaceState({}, '', location.pathname + location.search + location.hash);
    } catch (e) { /* ignore */ }
  }

  // ---------- Run ----------
  // If index.html should set the token, here's suggested code (put in index.html):
  // sessionStorage.setItem('enteredFromHome_v2', 'yes'); sessionStorage.setItem('enteredFromHome_time_v2', Math.floor(Date.now()/1000));
  //
  // This script will honor that token + optional expiry.

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initProtection();
  } else {
    document.addEventListener('DOMContentLoaded', initProtection);
  }

})();
