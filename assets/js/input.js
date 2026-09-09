/*
 * input.js — Unified input controller.
 * Funnels keyboard, mouse buttons, touch buttons, swipe gestures and a
 * virtual joystick into a single set of game actions. Attaches listeners
 * exactly once (bindGame swaps the target game object, not the listeners).
 */
(function () {
  'use strict';

  var DAS_MS = 170;   // delay before auto-repeat kicks in
  var ARR_MS = 40;    // auto-repeat interval

  function Controller(root) {
    this.root = root || document;
    this.game = null;
    this.enabled = true;
    this.layout = 'arrows'; // 'arrows' | 'wasd'
    this.moveDir = 0;       // -1, 0, 1
    this.dasTimer = null;
    this.arrTimer = null;
    this.softHeld = false;
    this.onAction = null; // optional callback(action) for UI feedback (e.g. flash button)

    this._bindKeyboard();
    this._bindButtons();
    this._bindTouchBoard();
    this._bindJoystick();
  }

  Controller.prototype.setGame = function (game) {
    this.game = game;
    this._clearMove();
  };

  Controller.prototype.setLayout = function (layout) {
    this.layout = layout;
  };

  Controller.prototype._fire = function (action) {
    if (this.onAction) this.onAction(action);
  };

  // ---------- Action dispatch ----------
  Controller.prototype.doLeft = function () {
    if (!this.game) return;
    this.game.moveLeft();
    this._fire('left');
  };
  Controller.prototype.doRight = function () {
    if (!this.game) return;
    this.game.moveRight();
    this._fire('right');
  };
  Controller.prototype.doRotate = function () {
    if (!this.game) return;
    this.game.rotate(1);
    this._fire('rotate');
  };
  Controller.prototype.doSoftStart = function () {
    if (!this.game) return;
    this.game.softDropStart();
    this._fire('softdrop');
  };
  Controller.prototype.doSoftStop = function () {
    if (!this.game) return;
    this.game.softDropStop();
  };
  Controller.prototype.doHardDrop = function () {
    if (!this.game) return;
    this.game.hardDrop();
    this._fire('harddrop');
  };
  Controller.prototype.doPause = function () {
    if (!this.game) return;
    this.game.togglePause();
    this._fire('pause');
  };

  // ---------- Held-direction repeat (DAS/ARR) ----------
  Controller.prototype._startMove = function (dir) {
    if (this.moveDir === dir) return;
    this._clearMove();
    this.moveDir = dir;
    if (dir === -1) this.doLeft(); else this.doRight();
    var self = this;
    this.dasTimer = setTimeout(function () {
      self.arrTimer = setInterval(function () {
        if (self.moveDir === -1) self.doLeft(); else if (self.moveDir === 1) self.doRight();
      }, ARR_MS);
    }, DAS_MS);
  };
  Controller.prototype._clearMove = function () {
    this.moveDir = 0;
    if (this.dasTimer) { clearTimeout(this.dasTimer); this.dasTimer = null; }
    if (this.arrTimer) { clearInterval(this.arrTimer); this.arrTimer = null; }
  };

  // ---------- Keyboard ----------
  Controller.prototype._bindKeyboard = function () {
    var self = this;
    var heldKeys = {};

    window.addEventListener('keydown', function (e) {
      if (!self.enabled || !self.game) return;
      // Ignore repeats fired by the OS for keys we already handle ourselves,
      // and ignore typing inside text inputs (e.g. player name field).
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      var code = e.code;
      var isLeft = code === 'ArrowLeft' || (self.layout === 'wasd' && code === 'KeyA');
      var isRight = code === 'ArrowRight' || (self.layout === 'wasd' && code === 'KeyD');
      var isDown = code === 'ArrowDown' || (self.layout === 'wasd' && code === 'KeyS');
      var isRotate = code === 'ArrowUp' || (self.layout === 'wasd' && code === 'KeyW');
      var isHard = code === 'Space';
      var isPause = code === 'KeyP';
      var isRestart = code === 'KeyR';

      if (isLeft || isRight || isDown || isRotate || isHard || isPause || isRestart) {
        e.preventDefault();
      }

      if (heldKeys[code]) return; // ignore native auto-repeat, we do our own
      heldKeys[code] = true;

      if (isLeft) self._startMove(-1);
      else if (isRight) self._startMove(1);
      else if (isDown) self.doSoftStart();
      else if (isRotate) self.doRotate();
      else if (isHard) self.doHardDrop();
      else if (isPause) self.doPause();
      else if (isRestart) self._fire('restart-key');
    }, { passive: false });

    window.addEventListener('keyup', function (e) {
      var code = e.code;
      heldKeys[code] = false;
      var isLeft = code === 'ArrowLeft' || (self.layout === 'wasd' && code === 'KeyA');
      var isRight = code === 'ArrowRight' || (self.layout === 'wasd' && code === 'KeyD');
      var isDown = code === 'ArrowDown' || (self.layout === 'wasd' && code === 'KeyS');
      if ((isLeft && self.moveDir === -1) || (isRight && self.moveDir === 1)) self._clearMove();
      if (isDown) self.doSoftStop();
    });

    // Stop held movement if the window loses focus (avoids stuck-key drift).
    window.addEventListener('blur', function () {
      self._clearMove();
      self.doSoftStop();
      heldKeys = {};
    });
  };

  // ---------- On-screen buttons (mouse + touch share the same handlers) ----------
  Controller.prototype._bindButtons = function () {
    var self = this;
    function bindPress(id, onDown, onUp) {
      var el = document.getElementById(id);
      if (!el) return;
      var active = false;
      function start(e) {
        e.preventDefault();
        if (active) return;
        active = true;
        el.classList.add('btn-active');
        onDown();
      }
      function end(e) {
        if (e) e.preventDefault();
        if (!active) return;
        active = false;
        el.classList.remove('btn-active');
        if (onUp) onUp();
      }
      el.addEventListener('mousedown', start);
      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('mouseup', end);
      el.addEventListener('mouseleave', end);
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    bindPress('btn-left', function () { self._startMove(-1); }, function () { if (self.moveDir === -1) self._clearMove(); });
    bindPress('btn-right', function () { self._startMove(1); }, function () { if (self.moveDir === 1) self._clearMove(); });
    bindPress('btn-down', function () { self.doSoftStart(); }, function () { self.doSoftStop(); });
    bindPress('btn-rotate', function () { self.doRotate(); });
    bindPress('btn-harddrop', function () { self.doHardDrop(); });
    bindPress('btn-pause', function () { self.doPause(); });
  };

  // ---------- Swipe gestures + press-and-hold-to-drop on the board itself ----------
  Controller.prototype._bindTouchBoard = function () {
    var self = this;
    var el = document.getElementById('board-touch-zone');
    if (!el) return;
    var startX = 0, startY = 0, startT = 0, tracking = false;
    var SWIPE_MIN = 24;
    var MOVE_CANCEL_THRESHOLD = 18; // px of movement that cancels the long-press
    var LONG_PRESS_MS = 2000;
    var lastMoveX = 0;
    var longPressTimer = null;
    var longPressFired = false;

    el.style.touchAction = 'none';

    function clearLongPress() {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    }

    el.addEventListener('touchstart', function (e) {
      if (!self.enabled || !self.game) return;
      var t = e.changedTouches[0];
      startX = t.clientX; startY = t.clientY; lastMoveX = startX;
      startT = Date.now();
      tracking = true;
      longPressFired = false;
      clearLongPress();
      longPressTimer = setTimeout(function () {
        if (!tracking) return;
        longPressFired = true;
        self.doHardDrop();
      }, LONG_PRESS_MS);
    }, { passive: true });

    el.addEventListener('touchmove', function (e) {
      if (!tracking) return;
      e.preventDefault();
      var t = e.changedTouches[0];
      var dxTotal = t.clientX - startX;
      var dyTotal = t.clientY - startY;
      if (longPressTimer && (Math.abs(dxTotal) > MOVE_CANCEL_THRESHOLD || Math.abs(dyTotal) > MOVE_CANCEL_THRESHOLD)) {
        clearLongPress(); // real movement means this is a swipe, not a hold
      }
      if (longPressFired) return;
      var dx = t.clientX - lastMoveX;
      var dy = t.clientY - startY;
      if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) self.doRight(); else self.doLeft();
        lastMoveX = t.clientX;
      }
    }, { passive: false });

    el.addEventListener('touchend', function (e) {
      clearLongPress();
      if (!tracking) return;
      tracking = false;
      if (longPressFired) return; // hard drop already happened, ignore tap/swipe-up logic
      var t = e.changedTouches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      var dt = Date.now() - startT;
      if (Math.abs(dy) > Math.abs(dx) && dy > SWIPE_MIN) {
        // swipe down = soft drop pulse; fast+long swipe down = hard drop
        if (dy > 120 && dt < 250) self.doHardDrop();
        else { self.doSoftStart(); setTimeout(function () { self.doSoftStop(); }, 120); }
      } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        self.doRotate(); // tap = rotate
      }
    }, { passive: true });

    el.addEventListener('touchcancel', function () {
      clearLongPress();
      tracking = false;
    }, { passive: true });
  };

  // ---------- Virtual joystick ----------
  Controller.prototype._bindJoystick = function () {
    var self = this;
    var base = document.getElementById('joystick-base');
    var knob = document.getElementById('joystick-knob');
    if (!base || !knob) return;
    var active = false;
    var centerX = 0, centerY = 0;
    var maxDist = 36;
    var downTimer = null;

    function setKnob(dx, dy) {
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }

    function start(e) {
      e.preventDefault();
      active = true;
      var rect = base.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      move(e);
    }
    function move(e) {
      if (!active) return;
      var t = e.touches ? e.touches[0] : e;
      var dx = t.clientX - centerX;
      var dy = t.clientY - centerY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDist) { dx = dx / dist * maxDist; dy = dy / dist * maxDist; }
      setKnob(dx, dy);

      var deadzone = 12;
      // Horizontal
      if (dx > deadzone) self._startMove(1);
      else if (dx < -deadzone) self._startMove(-1);
      else self._clearMove();

      // Vertical (down = soft drop)
      if (dy > deadzone) self.doSoftStart();
      else self.doSoftStop();
    }
    function end(e) {
      if (e) e.preventDefault();
      active = false;
      setKnob(0, 0);
      self._clearMove();
      self.doSoftStop();
    }

    base.addEventListener('touchstart', start, { passive: false });
    base.addEventListener('touchmove', move, { passive: false });
    base.addEventListener('touchend', end, { passive: false });
    base.addEventListener('touchcancel', end, { passive: false });
    base.addEventListener('mousedown', start);
    window.addEventListener('mousemove', function (e) { if (active) move(e); });
    window.addEventListener('mouseup', end);
  };

  Controller.prototype.disable = function () {
    this.enabled = false;
    this._clearMove();
    this.doSoftStop();
  };
  Controller.prototype.enable = function () {
    this.enabled = true;
  };

  window.TetrisInput = { Controller: Controller };
})();
