/**
 * auth.js — Saila Twins Society Dashboard
 * Biometric lock using WebAuthn platform authenticator.
 * - Skips entirely if device has no biometric/platform auth support
 * - 20-minute inactivity timeout → re-lock
 * - Background → foreground check on visibility change
 */

(function () {
  'use strict';

  var TIMEOUT_MS    = 20 * 60 * 1000;   // 20 minutes
  var CRED_KEY      = 'saila_cred_id';
  var LAST_ACT_KEY  = 'saila_last_activity';
  var RP_NAME       = 'Saila Twins Society';
  var RP_ID         = window.location.hostname;    // e.g. de-tushar.github.io
  var USER_ID_BYTES = new Uint8Array([83, 97, 105, 108, 97, 85, 115, 101, 114]); // "SailaUser"

  // ── Overlay DOM ──────────────────────────────────────────────────────────
  var overlay, unlockBtn, statusMsg;

  function buildOverlay() {
    if (document.getElementById('saila-lock-overlay')) return;

    overlay = document.createElement('div');
    overlay.id = 'saila-lock-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:#1F3A5F',
      'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'gap:20px', 'padding:32px'
    ].join(';');

    var logo = document.createElement('div');
    logo.style.cssText = 'font-size:52px;line-height:1;';
    logo.textContent   = '🏢';

    var title = document.createElement('div');
    title.style.cssText = 'color:#fff;font-size:20px;font-weight:700;text-align:center;letter-spacing:-0.3px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    title.textContent   = 'Saila Twins Society';

    var sub = document.createElement('div');
    sub.style.cssText = 'color:rgba(255,255,255,0.65);font-size:13px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    sub.textContent   = 'Verify to continue';

    unlockBtn = document.createElement('button');
    unlockBtn.id = 'saila-unlock-btn';
    unlockBtn.textContent = '🔐  Unlock with Biometric';
    unlockBtn.style.cssText = [
      'margin-top:8px',
      'background:#fff', 'color:#1F3A5F',
      'border:none', 'border-radius:12px',
      'padding:16px 28px',
      'font-size:15px', 'font-weight:700',
      'cursor:pointer',
      'box-shadow:0 4px 16px rgba(0,0,0,0.25)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      'width:100%', 'max-width:280px'
    ].join(';');
    unlockBtn.addEventListener('click', handleUnlock);

    statusMsg = document.createElement('div');
    statusMsg.style.cssText = 'color:rgba(255,255,255,0.75);font-size:12px;text-align:center;min-height:18px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';

    overlay.appendChild(logo);
    overlay.appendChild(title);
    overlay.appendChild(sub);
    overlay.appendChild(unlockBtn);
    overlay.appendChild(statusMsg);
    document.body.appendChild(overlay);
  }

  function showOverlay() {
    if (!overlay) buildOverlay();
    overlay.style.display = 'flex';
    setStatus('');
    setUnlockBtnEnabled(true);
  }

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
  }

  function setStatus(msg) {
    if (statusMsg) statusMsg.textContent = msg;
  }

  function setUnlockBtnEnabled(enabled) {
    if (!unlockBtn) return;
    unlockBtn.disabled     = !enabled;
    unlockBtn.style.opacity = enabled ? '1' : '0.6';
  }

  // ── Activity tracking ────────────────────────────────────────────────────
  function stampActivity() {
    try { localStorage.setItem(LAST_ACT_KEY, Date.now().toString()); } catch(e) {}
  }

  function isTimedOut() {
    try {
      var last = parseInt(localStorage.getItem(LAST_ACT_KEY) || '0', 10);
      if (!last) return true;
      return (Date.now() - last) > TIMEOUT_MS;
    } catch(e) { return true; }
  }

  var ACTIVITY_EVENTS = ['click', 'touchstart', 'keydown', 'scroll', 'mousemove'];
  function attachActivityListeners() {
    ACTIVITY_EVENTS.forEach(function(evt) {
      document.addEventListener(evt, stampActivity, { passive: true });
    });
  }

  // ── WebAuthn helpers ─────────────────────────────────────────────────────
  function b64decode(str) {
    // Base64url → Uint8Array
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(str);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function b64encode(buf) {
    var arr = new Uint8Array(buf);
    var bin = '';
    arr.forEach(function(b) { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  function randomBytes(n) {
    var arr = new Uint8Array(n);
    crypto.getRandomValues(arr);
    return arr;
  }

  // Register a new platform credential and store credential ID
  function registerCredential() {
    return navigator.credentials.create({
      publicKey: {
        rp:      { id: RP_ID, name: RP_NAME },
        user:    { id: USER_ID_BYTES, name: 'resident', displayName: 'Resident' },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7  },   // ES256
          { type: 'public-key', alg: -257 }   // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        timeout: 60000
      }
    }).then(function(cred) {
      try { localStorage.setItem(CRED_KEY, b64encode(cred.rawId)); } catch(e) {}
      return cred;
    });
  }

  // Verify using stored credential
  function verifyCredential(credId) {
    return navigator.credentials.get({
      publicKey: {
        rpId:      RP_ID,
        challenge: randomBytes(32),
        allowCredentials: [{
          type: 'public-key',
          id:   b64decode(credId),
          transports: ['internal']
        }],
        userVerification: 'required',
        timeout: 60000
      }
    });
  }

  // ── Main unlock flow ─────────────────────────────────────────────────────
  function handleUnlock() {
    setUnlockBtnEnabled(false);
    setStatus('Waiting for biometric…');

    var storedId = null;
    try { storedId = localStorage.getItem(CRED_KEY); } catch(e) {}

    var promise;
    if (storedId) {
      promise = verifyCredential(storedId);
    } else {
      // First time: register
      setStatus('Setting up biometric…');
      promise = registerCredential();
    }

    promise.then(function() {
      stampActivity();
      hideOverlay();
      setStatus('');
      attachActivityListeners();
    }).catch(function(err) {
      setUnlockBtnEnabled(true);
      if (err && err.name === 'NotAllowedError') {
        setStatus('Cancelled — tap to try again');
      } else if (err && err.name === 'InvalidStateError') {
        // Credential may have been deleted — clear and retry fresh
        try { localStorage.removeItem(CRED_KEY); } catch(e2) {}
        setStatus('Credential reset — tap to re-enroll');
      } else {
        setStatus('Authentication failed — tap to retry');
      }
    });
  }

  // ── Capability check ─────────────────────────────────────────────────────
  function platformAuthAvailable() {
    if (!window.PublicKeyCredential) return Promise.resolve(false);
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return Promise.resolve(false);
    }
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function() {
      return false;
    });
  }

  // ── Visibility change handler ────────────────────────────────────────────
  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && isTimedOut()) {
      showOverlay();
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    platformAuthAvailable().then(function(available) {
      if (!available) {
        // Device has no biometric/platform auth → open freely
        return;
      }

      // Show lock overlay on every page load (timeout check)
      buildOverlay();

      if (isTimedOut()) {
        showOverlay();
      } else {
        // Session still valid — keep activity alive, stay unlocked
        stampActivity();
        attachActivityListeners();
      }

      document.addEventListener('visibilitychange', onVisibilityChange);
    });
  }

  // Run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for manual trigger if needed
  window.SailaAuth = { init: init };

})();
