/*
 * storage.js — Settings/name persistence via localStorage, and a thin
 * wrapper around the PHP high-score API with automatic fallback to
 * localStorage if the server endpoint is unavailable.
 */
(function () {
  'use strict';

  var LS_SETTINGS = 'tetris.settings.v1';
  var LS_SCORES = 'tetris.scores.v1';
  var DEFAULT_SETTINGS = {
    playerName: 'PLAYER 1',
    musicOn: true,
    sfxOn: true,
    volume: 0.6,
    startLevel: 1,
    controlLayout: 'arrows', // arrows | wasd
    dropShadowEnabled: true,
    dropShadowOpacity: 0.4, // 0–1, drives the landing-preview fill/outline alpha
    crtEffect: true,
    screenShake: true,
    animations: true,
    showGrid: true
  };

  function hasLocalStorage() {
    try {
      var k = '__t_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var lsAvailable = hasLocalStorage();

  function loadSettings() {
    if (!lsAvailable) return Object.assign({}, DEFAULT_SETTINGS);
    try {
      var raw = window.localStorage.getItem(LS_SETTINGS);
      if (!raw) return Object.assign({}, DEFAULT_SETTINGS);
      var parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_SETTINGS, parsed);
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(settings) {
    if (!lsAvailable) return;
    try {
      window.localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
    } catch (e) { /* ignore quota errors */ }
  }

  function loadLocalScores() {
    if (!lsAvailable) return [];
    try {
      var raw = window.localStorage.getItem(LS_SCORES);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalScores(arr) {
    if (!lsAvailable) return false;
    try {
      window.localStorage.setItem(LS_SCORES, JSON.stringify(arr));
      return true;
    } catch (e) {
      console.warn('Tetris: failed to write scores to localStorage.', e);
      return false;
    }
  }

  function addLocalScore(entry) {
    var arr = loadLocalScores();
    arr.push(entry);
    arr.sort(function (a, b) { return b.score - a.score; });
    arr = arr.slice(0, 20);
    var saved = saveLocalScores(arr);
    return { scores: saved ? arr : loadLocalScores(), saved: saved };
  }

  function sanitizeName(name) {
    name = String(name || '').trim();
    name = name.replace(/[^a-zA-Z0-9 _\-\.]/g, '');
    if (name.length === 0) name = 'PLAYER 1';
    return name.substring(0, 15);
  }

  // ---------- Server API with fallback ----------
  function apiAvailable() {
    // The PHP API can't respond over file:// or non-http(s) contexts —
    // skip the network round trip entirely so the UI doesn't hang waiting
    // on a request that can never succeed.
    return window.location && (window.location.protocol === 'http:' || window.location.protocol === 'https:');
  }

  function fetchWithTimeout(url, opts, ms) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('timeout')); }, ms || 4000);
      fetch(url, opts).then(function (res) {
        clearTimeout(timer);
        resolve(res);
      }).catch(function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function getScores() {
    if (!lsAvailable) {
      console.warn('Tetris: localStorage unavailable in this browser/context.');
    }
    if (!apiAvailable()) {
      return Promise.resolve({ scores: loadLocalScores(), source: 'local', reason: 'not-http', lsAvailable: lsAvailable });
    }
    return fetchWithTimeout('api/get_scores.php', { method: 'GET', headers: { 'Accept': 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.scores)) throw new Error('Unexpected response shape');
        return { scores: data.scores, source: 'server', lsAvailable: lsAvailable };
      })
      .catch(function (err) {
        console.warn('Tetris: could not reach api/get_scores.php, showing local scores instead.', err);
        return { scores: loadLocalScores(), source: 'local', reason: String(err && err.message || err), lsAvailable: lsAvailable };
      });
  }

  function submitScore(entry) {
    var payload = {
      name: sanitizeName(entry.name),
      score: Math.max(0, Math.floor(Number(entry.score) || 0)),
      level: Math.max(1, Math.floor(Number(entry.level) || 1)),
      lines: Math.max(0, Math.floor(Number(entry.lines) || 0))
    };
    if (!apiAvailable()) {
      var localResult = addLocalScore({
        name: payload.name,
        score: payload.score,
        level: payload.level,
        lines: payload.lines,
        date: new Date().toISOString().substring(0, 10)
      });
      return Promise.resolve({
        scores: localResult.scores,
        source: 'local',
        saved: localResult.saved,
        reason: localResult.saved ? undefined : 'localStorage write failed',
        lsAvailable: lsAvailable
      });
    }
    return fetchWithTimeout('api/save_score.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 4000)
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (data) {
          if (!res.ok || !data || data.ok !== true) {
            var msg = (data && data.error) ? data.error : ('HTTP ' + res.status);
            throw new Error(msg);
          }
          return data;
        });
      })
      .then(function (data) {
        return { scores: data.scores || [], source: 'server', lsAvailable: lsAvailable };
      })
      .catch(function (err) {
        console.warn('Tetris: could not reach api/save_score.php, saving locally instead.', err);
        var localResult = addLocalScore({
          name: payload.name,
          score: payload.score,
          level: payload.level,
          lines: payload.lines,
          date: new Date().toISOString().substring(0, 10)
        });
        return {
          scores: localResult.scores,
          source: 'local',
          saved: localResult.saved,
          reason: String(err && err.message || err),
          lsAvailable: lsAvailable
        };
      });
  }

  window.TetrisStorage = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    loadLocalScores: loadLocalScores,
    addLocalScore: addLocalScore,
    sanitizeName: sanitizeName,
    getScores: getScores,
    submitScore: submitScore,
    isLocalStorageAvailable: function () { return lsAvailable; }
  };
})();
