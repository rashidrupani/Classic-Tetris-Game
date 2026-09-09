/*
 * ui.js — Screens, HUD, settings, and the glue that wires game.js,
 * input.js, audio.js and storage.js together. Runs on DOMContentLoaded.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var settings = window.TetrisStorage.loadSettings();
  var audio = new window.TetrisAudio.AudioManager();
  var controller = new window.TetrisInput.Controller();
  var game = null;
  var resizeScheduled = false;

  // ---------- Screen management ----------
  var screens = ['screen-menu', 'screen-game', 'screen-settings', 'screen-highscores', 'screen-howtoplay'];
  function showScreen(id) {
    for (var i = 0; i < screens.length; i++) {
      var el = $(screens[i]);
      if (!el) continue;
      el.classList.toggle('active', screens[i] === id);
    }
    // Keep the footer out of the way during actual gameplay so it never
    // eats into the board's available height.
    var footer = $('site-footer');
    if (footer) footer.classList.toggle('footer-hidden', id === 'screen-game');
  }

  // ---------- Apply settings to DOM/audio/input ----------
  function applySettings() {
    audio.setVolume(settings.volume);
    audio.setMusicEnabled(settings.musicOn);
    audio.setSfxEnabled(settings.sfxOn);
    controller.setLayout(settings.controlLayout);

    document.body.classList.toggle('crt-on', !!settings.crtEffect);
    document.body.classList.toggle('anim-off', !settings.animations);

    if ($('input-player-name')) $('input-player-name').value = settings.playerName;
    if ($('input-player-name-menu')) $('input-player-name-menu').value = settings.playerName;
    if ($('hud-playername')) $('hud-playername').textContent = settings.playerName;
    if ($('select-start-level')) $('select-start-level').value = settings.startLevel;
    if ($('select-control-layout')) $('select-control-layout').value = settings.controlLayout;
    if ($('toggle-music')) $('toggle-music').checked = settings.musicOn;
    if ($('toggle-sfx')) $('toggle-sfx').checked = settings.sfxOn;
    if ($('range-volume')) $('range-volume').value = Math.round(settings.volume * 100);
    if ($('toggle-dropshadow')) $('toggle-dropshadow').checked = settings.dropShadowEnabled;
    if ($('range-dropshadow-opacity')) $('range-dropshadow-opacity').value = Math.round(settings.dropShadowOpacity * 100);
    if ($('toggle-crt')) $('toggle-crt').checked = settings.crtEffect;
    if ($('toggle-shake')) $('toggle-shake').checked = settings.screenShake;
    if ($('toggle-animations')) $('toggle-animations').checked = settings.animations;
    if ($('toggle-grid')) $('toggle-grid').checked = settings.showGrid;

    if (game) {
      game.settings.showGrid = settings.showGrid;
      game.settings.dropShadowEnabled = settings.dropShadowEnabled;
      game.settings.dropShadowOpacity = settings.dropShadowOpacity;
    }
  }

  function persist() {
    window.TetrisStorage.saveSettings(settings);
  }

  // ---------- Canvas sizing (responsive) ----------
  // Board sizing is fully JS-driven (rather than relying on CSS aspect-ratio,
  // which fights with height:100% across browsers) so the board reliably
  // fills the available height first — "full screen" board as requested —
  // and only falls back to width-constrained sizing on narrow viewports.
  function resizeCanvases() {
    var boardCanvas = $('board-canvas');
    var wrap = $('board-wrap');
    var col = wrap ? wrap.parentElement : null;
    if (!boardCanvas || !wrap || !col) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    var maxH = col.clientHeight;
    var maxW = col.clientWidth;

    // On desktop the NEXT-piece box shares this row with the board; measure
    // its actual rendered width directly and subtract it (plus the flex
    // gap) so the board never has to fight it for space. On mobile that box
    // is hidden (offsetParent is null), so this contributes nothing there.
    // Note: we never touch board-wrap's own size before measuring — doing
    // so previously (clearing its inline width/height to "remeasure" via
    // flexbox) could transiently expose the canvas's backing-store size
    // (which is dpr-scaled, i.e. up to 2x the intended display size) as its
    // effective content size, occasionally causing an oversized layout.
    var nextBox = $('next-standalone');
    if (nextBox && nextBox.offsetParent !== null) {
      var gapPx = parseFloat(window.getComputedStyle(col).columnGap) || 30;
      maxW -= (nextBox.getBoundingClientRect().width + gapPx);
    }
    if (maxW < 100) maxW = 100; // sane floor in case of a transient zero-width read

    var h = maxH;
    var w = h / 2;
    if (w > maxW) { w = maxW; h = w * 2; }
    // Belt-and-suspenders: never let rounding or an unusual layout produce
    // a board bigger than the space actually available to it.
    w = Math.min(w, maxW);
    h = Math.min(h, maxH);

    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';

    boardCanvas.style.width = w + 'px';
    boardCanvas.style.height = h + 'px';
    boardCanvas.width = Math.round(w * dpr);
    boardCanvas.height = Math.round(h * dpr);

    ['next-canvas', 'next-canvas-mobile'].forEach(function (id) {
      var nextCanvas = $(id);
      if (!nextCanvas) return;
      var nw = nextCanvas.clientWidth || 100;
      var nh = nextCanvas.clientHeight || 100;
      nextCanvas.style.width = nw + 'px';
      nextCanvas.style.height = nh + 'px';
      nextCanvas.width = Math.round(nw * dpr);
      nextCanvas.height = Math.round(nh * dpr);
    });

    if (game) game.render();
  }

  function scheduleResize() {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(function () {
      resizeScheduled = false;
      resizeCanvases();
    });
  }

  // ---------- HUD ----------
  function updateHud(state) {
    if ($('hud-score')) $('hud-score').textContent = state.score;
    if ($('hud-level')) $('hud-level').textContent = state.level;
    if ($('hud-lines')) $('hud-lines').textContent = state.lines;
    // Compact mirrors shown in the mobile top bar (panel-left with the full
    // stat boxes is hidden on small screens).
    if ($('hud-score-mobile')) $('hud-score-mobile').textContent = state.score;
    if ($('hud-level-mobile')) $('hud-level-mobile').textContent = state.level;
    if ($('hud-lines-mobile')) $('hud-lines-mobile').textContent = state.lines;
  }

  function flashLineClear(count) {
    if (!settings.animations) return;
    var el = $('board-wrap');
    if (!el) return;
    var cls = count >= 4 ? 'flash-tetris' : 'flash-clear';
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 320);
    // Note: the actual visual feedback for cleared lines is the dust-particle
    // effect drawn directly on the board canvas (see game.js) — this class
    // only adds a brief, smooth glow pulse, no screen shake/jerk.
  }

  function flashBombExplosion() {
    if (!settings.animations) return;
    var el = $('board-wrap');
    if (!el) return;
    el.classList.add('flash-bomb');
    setTimeout(function () { el.classList.remove('flash-bomb'); }, 380);
  }

  var bombToastTimer = null;
  function showBombToast() {
    var wrap = $('board-wrap');
    if (!wrap) return;
    var toast = $('bomb-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bomb-toast';
      toast.className = 'bomb-toast';
      toast.textContent = '💣 BOMB PIECE!';
      wrap.appendChild(toast);
    }
    // Restart the animation even if a previous toast is still fading.
    toast.classList.remove('show');
    // Force reflow so removing+re-adding the class re-triggers the CSS animation.
    void toast.offsetWidth;
    toast.classList.add('show');
    if (bombToastTimer) clearTimeout(bombToastTimer);
    bombToastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1400);
  }

  // ---------- Game lifecycle ----------
  function createGame() {
    if (game) {
      game.stop();
      game = null;
    }
    var boardCanvas = $('board-canvas');
    var nextCanvases = [$('next-canvas'), $('next-canvas-mobile')].filter(Boolean);

    game = new window.TetrisGame.Game({
      boardCanvas: boardCanvas,
      nextCanvases: nextCanvases,
      settings: {
        startLevel: parseInt(settings.startLevel, 10) || 1,
        showGrid: settings.showGrid,
        dropShadowEnabled: settings.dropShadowEnabled,
        dropShadowOpacity: settings.dropShadowOpacity
      },
      callbacks: {
        sfx: function (name) { audio.play(name); },
        score: function (s) { updateHud(s); },
        lineclear: function (d) { updateHud(game.getState()); flashLineClear(d.count); },
        levelup: function () { updateHud(game.getState()); },
        bombexplode: function () { updateHud(game.getState()); flashBombExplosion(); },
        pause: function () { $('pause-overlay').classList.add('active'); },
        resume: function () { $('pause-overlay').classList.remove('active'); },
        gameover: function (data) { onGameOver(data); },
        spawn: function (d) { if (d && d.isBomb) showBombToast(); }
      }
    });

    controller.setGame(game);
    updateHud(game.getState());
    resizeCanvases();
    game.render();
    game.start();
  }

  function onGameOver(data) {
    $('pause-overlay').classList.remove('active'); // never show both overlays at once (e.g. after "End Game")
    if (settings.screenShake) {
      var el = $('board-wrap');
      if (el) {
        el.classList.add('shake-big');
        setTimeout(function () { el.classList.remove('shake-big'); }, 500);
      }
    }
    $('go-score').textContent = data.score;
    $('go-level').textContent = data.level;
    $('go-lines').textContent = data.lines;
    $('go-name').textContent = settings.playerName;
    $('gameover-overlay').classList.add('active');

    // Always rebuild the submit control fresh. A previous game's submission
    // replaces this row's markup with a "submitted" message, so re-querying
    // a stale #btn-go-submit here would return null and throw — this bug
    // was the actual cause of high scores silently breaking after game 1.
    var submitRow = $('go-submit-row');
    submitRow.innerHTML = '<button id="btn-go-submit" class="pixel-btn small">SUBMIT SCORE</button>';
    var submitBtn = $('btn-go-submit');
    submitBtn.onclick = function () {
      submitBtn.disabled = true;
      submitBtn.textContent = 'SUBMITTING…';
      window.TetrisStorage.submitScore({
        name: settings.playerName,
        score: data.score,
        level: data.level,
        lines: data.lines
      }).then(function (res) {
        var note, cls;
        if (res.source === 'server') {
          note = 'SCORE SUBMITTED';
          cls = 'submitted-msg';
        } else if (res.saved === false) {
          note = 'COULD NOT SAVE — local storage is unavailable in this browser/tab';
          cls = 'submit-error-msg';
        } else {
          note = 'SAVED LOCALLY (OFFLINE)';
          cls = 'submitted-msg';
        }
        submitRow.innerHTML = '<span class="' + cls + '">' + note + '</span>';
        renderHighScores();
      });
    };
  }

  function restartGame() {
    $('gameover-overlay').classList.remove('active');
    $('pause-overlay').classList.remove('active');
    createGame();
  }

  // ---------- High scores ----------
  function renderHighScores() {
    var list = $('highscores-list');
    if (!list) return;
    var initial = window.__TETRIS_INITIAL_SCORES__;
    if (initial && initial.length) {
      list.innerHTML = buildScoresHtml(initial);
    } else {
      list.innerHTML = '<li class="hs-loading">Loading…</li>';
    }
    window.TetrisStorage.getScores().then(function (res) {
      var scores = res.scores.slice(0, 20);
      list.innerHTML = buildScoresHtml(scores);
      var srcNote = $('hs-source-note');
      if (!srcNote) return;
      if (res.source === 'server') {
        srcNote.textContent = 'Global high scores';
      } else if (res.lsAvailable === false) {
        srcNote.textContent = 'This browser/embed is blocking local storage, so scores can\'t be saved here — try opening the page in a normal browser tab.';
      } else if (res.reason) {
        srcNote.textContent = 'Local high scores (offline) — server unreachable: ' + res.reason;
      } else {
        srcNote.textContent = 'Local high scores (offline)';
      }
    });
  }

  function buildScoresHtml(scores) {
    if (!scores || scores.length === 0) {
      return '<li class="hs-empty">No scores yet. Be the first!</li>';
    }
    var html = '';
    for (var i = 0; i < scores.length; i++) {
      var s = scores[i];
      html += '<li><span class="hs-rank">' + (i + 1) + '</span>' +
        '<span class="hs-name">' + escapeHtml(s.name) + '</span>' +
        '<span class="hs-score">' + Number(s.score).toLocaleString() + '</span>' +
        '<span class="hs-meta">Lv ' + s.level + ' · ' + s.lines + ' lines</span></li>';
    }
    return html;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- Wire up menu buttons ----------
  function bindMenu() {
    $('btn-start').addEventListener('click', function () {
      audio.unlock();
      showScreen('screen-game');
      restartGame();
    });
    $('btn-highscores').addEventListener('click', function () {
      showScreen('screen-highscores');
      renderHighScores();
    });
    $('btn-settings').addEventListener('click', function () { showScreen('screen-settings'); });
    $('btn-howtoplay').addEventListener('click', function () { showScreen('screen-howtoplay'); });

    document.querySelectorAll('.btn-back').forEach(function (btn) {
      btn.addEventListener('click', function () { showScreen('screen-menu'); });
    });

    $('btn-resume').addEventListener('click', function () { if (game) game.resume(); });
    $('btn-restart-ingame').addEventListener('click', function () { audio.unlock(); restartGame(); });
    $('btn-quit-ingame').addEventListener('click', function () {
      if (game) game.stop();
      showScreen('screen-menu');
    });
    $('btn-end-game').addEventListener('click', function () {
      if (!game || game.gameOver) return;
      var wasPaused = game.paused;
      if (!wasPaused) game.pause();
      var sure = window.confirm('End the current game now? Your current score will be final.');
      if (sure) {
        game.endGame(); // triggers the normal game-over flow, including score submission
      } else if (!wasPaused) {
        game.resume();
      }
    });

    $('btn-go-playagain').addEventListener('click', function () { audio.unlock(); restartGame(); });
    $('btn-go-highscores').addEventListener('click', function () {
      $('gameover-overlay').classList.remove('active');
      showScreen('screen-highscores');
      renderHighScores();
    });
    $('btn-go-menu').addEventListener('click', function () {
      $('gameover-overlay').classList.remove('active');
      showScreen('screen-menu');
    });

    $('btn-fullscreen').addEventListener('click', function () {
      var el = document.documentElement;
      if (!document.fullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    });

    controller.onAction = function (action) {
      if (action === 'restart-key') { /* R key only restarts from in-game screen */
        if ($('screen-game').classList.contains('active') && game) restartGame();
      }
    };
  }

  function bindSettings() {
    // Both the menu-screen name field and the settings-screen name field
    // stay in sync, and the persistent right-panel HUD label updates live.
    var nameInputs = [$('input-player-name-menu'), $('input-player-name')].filter(Boolean);
    nameInputs.forEach(function (input) {
      input.addEventListener('input', function (e) {
        settings.playerName = window.TetrisStorage.sanitizeName(e.target.value) || '';
        if ($('hud-playername')) $('hud-playername').textContent = settings.playerName || 'PLAYER 1';
        nameInputs.forEach(function (other) {
          if (other !== e.target) other.value = e.target.value;
        });
        persist();
      });
      input.addEventListener('blur', function (e) {
        if (!settings.playerName) settings.playerName = 'PLAYER 1';
        nameInputs.forEach(function (other) { other.value = settings.playerName; });
        if ($('hud-playername')) $('hud-playername').textContent = settings.playerName;
        persist();
      });
    });

    $('select-start-level').addEventListener('change', function (e) {
      settings.startLevel = parseInt(e.target.value, 10) || 1;
      persist();
    });
    $('select-control-layout').addEventListener('change', function (e) {
      settings.controlLayout = e.target.value;
      controller.setLayout(settings.controlLayout);
      persist();
    });
    $('toggle-music').addEventListener('change', function (e) {
      settings.musicOn = e.target.checked;
      audio.unlock();
      audio.setMusicEnabled(settings.musicOn);
      persist();
    });
    $('toggle-sfx').addEventListener('change', function (e) {
      settings.sfxOn = e.target.checked;
      audio.setSfxEnabled(settings.sfxOn);
      persist();
    });
    $('range-volume').addEventListener('input', function (e) {
      settings.volume = parseInt(e.target.value, 10) / 100;
      audio.setVolume(settings.volume);
      persist();
    });
    $('toggle-dropshadow').addEventListener('change', function (e) {
      settings.dropShadowEnabled = e.target.checked;
      if (game) game.settings.dropShadowEnabled = settings.dropShadowEnabled;
      persist();
    });
    $('range-dropshadow-opacity').addEventListener('input', function (e) {
      settings.dropShadowOpacity = parseInt(e.target.value, 10) / 100;
      if (game) game.settings.dropShadowOpacity = settings.dropShadowOpacity;
      persist();
    });
    $('toggle-crt').addEventListener('change', function (e) {
      settings.crtEffect = e.target.checked;
      document.body.classList.toggle('crt-on', settings.crtEffect);
      persist();
    });
    $('toggle-shake').addEventListener('change', function (e) {
      settings.screenShake = e.target.checked;
      persist();
    });
    $('toggle-animations').addEventListener('change', function (e) {
      settings.animations = e.target.checked;
      document.body.classList.toggle('anim-off', !settings.animations);
      persist();
    });
    $('toggle-grid').addEventListener('change', function (e) {
      settings.showGrid = e.target.checked;
      if (game) game.settings.showGrid = settings.showGrid;
      persist();
    });
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', function () {
    applySettings();
    bindMenu();
    bindSettings();
    renderHighScores();
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);

    // First user gesture anywhere unlocks audio (autoplay policy compliance).
    var unlockOnce = function () { audio.unlock(); document.removeEventListener('pointerdown', unlockOnce); };
    document.addEventListener('pointerdown', unlockOnce);

    // Pause automatically if the tab is hidden, so gravity doesn't "jump"
    // by a huge clamped delta and so background CPU isn't wasted for hours-long sessions.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && game && !game.paused && !game.gameOver) {
        game.pause();
      }
    });

    showScreen('screen-menu');
  });
})();
