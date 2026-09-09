/*
 * game.js — Core Tetris engine.
 * Pure logic + canvas rendering. No DOM menu code lives here (see ui.js).
 * Exposes a single global namespace: window.TetrisGame
 */
(function () {
  'use strict';

  // ---------- Constants ----------
  var COLS = 10;
  var VISIBLE_ROWS = 20;
  var HIDDEN_ROWS = 2; // spawn buffer above the visible board
  var TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

  var LOCK_DELAY_MS = 500; // time a grounded piece waits before locking
  var MAX_LOCK_RESETS = 15; // prevent infinite lock-delay stalling
  var BOMB_CHANCE = 0.12; // ~1 in 8 pieces is a bomb piece — noticeable but not disruptive
  var BOMB_RADIUS = 1; // 3x3 explosion centered on the bomb cell

  var COLORS = {
    I: '#00f0f0',
    O: '#f0f000',
    T: '#a000f0',
    S: '#00f000',
    Z: '#f00000',
    J: '#0000f0',
    L: '#f0a000'
  };

  // Rotation states expressed as cell offsets inside a bounding box.
  // Coordinate system: x right, y down.
  var SHAPES = {
    I: {
      size: 4,
      states: [
        [[0, 1], [1, 1], [2, 1], [3, 1]],
        [[2, 0], [2, 1], [2, 2], [2, 3]],
        [[0, 2], [1, 2], [2, 2], [3, 2]],
        [[1, 0], [1, 1], [1, 2], [1, 3]]
      ]
    },
    O: {
      size: 4,
      states: [
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [2, 1]]
      ]
    },
    T: {
      size: 3,
      states: [
        [[1, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [2, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [1, 2]],
        [[1, 0], [0, 1], [1, 1], [1, 2]]
      ]
    },
    S: {
      size: 3,
      states: [
        [[1, 0], [2, 0], [0, 1], [1, 1]],
        [[1, 0], [1, 1], [2, 1], [2, 2]],
        [[1, 1], [2, 1], [0, 2], [1, 2]],
        [[0, 0], [0, 1], [1, 1], [1, 2]]
      ]
    },
    Z: {
      size: 3,
      states: [
        [[0, 0], [1, 0], [1, 1], [2, 1]],
        [[2, 0], [1, 1], [2, 1], [1, 2]],
        [[0, 1], [1, 1], [1, 2], [2, 2]],
        [[1, 0], [0, 1], [1, 1], [0, 2]]
      ]
    },
    J: {
      size: 3,
      states: [
        [[0, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [2, 0], [1, 1], [1, 2]],
        [[0, 1], [1, 1], [2, 1], [2, 2]],
        [[1, 0], [1, 1], [0, 2], [1, 2]]
      ]
    },
    L: {
      size: 3,
      states: [
        [[2, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [1, 2], [2, 2]],
        [[0, 1], [1, 1], [2, 1], [0, 2]],
        [[0, 0], [1, 0], [1, 1], [1, 2]]
      ]
    }
  };

  var PIECE_KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  // ---------- Small color helpers for the beveled block look ----------
  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 255, g: 255, b: 255 };
  }
  function lighten(hex, amt) {
    var c = hexToRgb(hex);
    var r = Math.round(c.r + (255 - c.r) * amt);
    var g = Math.round(c.g + (255 - c.g) * amt);
    var b = Math.round(c.b + (255 - c.b) * amt);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function darken(hex, amt) {
    var c = hexToRgb(hex);
    var r = Math.round(c.r * (1 - amt));
    var g = Math.round(c.g * (1 - amt));
    var b = Math.round(c.b * (1 - amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Simple, robust wall-kick offsets tried in order after a rotation attempt.
  // Not full SRS, but prevents rotation from feeling "broken" near walls/floor.
  var KICKS = [
    [0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]
  ];

  // ---------- 7-bag randomizer ----------
  function Bag() {
    this.queue = [];
  }
  Bag.prototype.refill = function () {
    var bag = PIECE_KEYS.slice();
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
    }
    this.queue = this.queue.concat(bag);
  };
  Bag.prototype.next = function () {
    if (this.queue.length < 8) this.refill();
    return this.queue.shift();
  };

  // ---------- Piece ----------
  function Piece(type, isBomb) {
    this.type = type;
    this.rotation = 0;
    this.isBomb = !!isBomb;
    // Which of the piece's 4 cells (by index into a rotation state's offset
    // list) carries the bomb — the index is stable across rotation states
    // since every shape always has exactly 4 offsets per state.
    this.bombCellIndex = this.isBomb ? Math.floor(Math.random() * 4) : -1;
    var shape = SHAPES[type];
    this.x = Math.floor((COLS - shape.size) / 2);
    this.y = HIDDEN_ROWS - 1;
  }
  Piece.prototype.cells = function (rotation, x, y) {
    var shape = SHAPES[this.type];
    var r = ((rotation % 4) + 4) % 4;
    var offsets = shape.states[r];
    var out = [];
    for (var i = 0; i < offsets.length; i++) {
      out.push([x + offsets[i][0], y + offsets[i][1]]);
    }
    return out;
  };

  // ---------- Game ----------
  function Game(opts) {
    opts = opts || {};
    this.boardCanvas = opts.boardCanvas;
    this.boardCtx = this.boardCanvas ? this.boardCanvas.getContext('2d') : null;

    // Supports rendering the NEXT-piece preview to more than one canvas at
    // once (desktop shows it beside the board, mobile shows a separate one
    // in the bottom bar; only one is visible via CSS at a time, but both
    // stay in sync without any DOM node needing to move between layouts).
    var nextCanvases = opts.nextCanvases || (opts.nextCanvas ? [opts.nextCanvas] : []);
    this.nextCanvas = nextCanvases[0] || null; // kept for backward compatibility
    this.nextTargets = nextCanvases.map(function (cvs) {
      return { canvas: cvs, ctx: cvs.getContext('2d') };
    });

    this.callbacks = opts.callbacks || {};
    this.settings = opts.settings || {};

    this._rafId = null;
    this._running = false;
    this._lastTime = 0;
    this.particles = [];

    this.reset(this.settings.startLevel || 1);
  }

  Game.prototype.reset = function (startLevel) {
    this.board = [];
    for (var r = 0; r < TOTAL_ROWS; r++) {
      this.board.push(new Array(COLS).fill(null));
    }
    this.bag = new Bag();
    this.nextQueue = [this._drawQueueItem(), this._drawQueueItem()];
    this.current = null;
    this.score = 0;
    this.level = startLevel || 1;
    this.startLevel = startLevel || 1;
    this.lines = 0;
    this.gravityAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    this.isLocking = false;
    this.paused = false;
    this.gameOver = false;
    this.softDropping = false;
    this.particles = [];
    this._spawnNext();
  };

  Game.prototype._gravityInterval = function () {
    var lvl = this.level;
    var ms = 1000 - (lvl - 1) * 60;
    if (ms < 60) ms = 60;
    return ms;
  };

  Game.prototype._drawQueueItem = function () {
    return { type: this.bag.next(), isBomb: Math.random() < BOMB_CHANCE };
  };

  Game.prototype._spawnNext = function () {
    var next = this.nextQueue.shift();
    this.nextQueue.push(this._drawQueueItem());
    this.current = new Piece(next.type, next.isBomb);
    this.lockAcc = 0;
    this.lockResets = 0;
    this.isLocking = false;
    if (this._collides(this.current.rotation, this.current.x, this.current.y)) {
      this._endGame();
      return false;
    }
    this._notify('spawn', { isBomb: this.current.isBomb });
    return true;
  };

  Game.prototype._collides = function (rotation, x, y) {
    var cells = this.current.cells(rotation, x, y);
    for (var i = 0; i < cells.length; i++) {
      var cx = cells[i][0], cy = cells[i][1];
      if (cx < 0 || cx >= COLS || cy >= TOTAL_ROWS) return true;
      if (cy < 0) continue;
      if (this.board[cy][cx]) return true;
    }
    return false;
  };

  Game.prototype._isGrounded = function () {
    return this._collides(this.current.rotation, this.current.x, this.current.y + 1);
  };

  Game.prototype.moveLeft = function () { this._tryMove(-1, 0); };
  Game.prototype.moveRight = function () { this._tryMove(1, 0); };

  Game.prototype._tryMove = function (dx, dy) {
    if (this.paused || this.gameOver || !this.current) return false;
    var nx = this.current.x + dx, ny = this.current.y + dy;
    if (!this._collides(this.current.rotation, nx, ny)) {
      this.current.x = nx;
      this.current.y = ny;
      if (this.isLocking) this._bumpLockDelay();
      this._sfx('move');
      return true;
    }
    return false;
  };

  Game.prototype._bumpLockDelay = function () {
    if (this.lockResets < MAX_LOCK_RESETS) {
      this.lockAcc = 0;
      this.lockResets++;
    }
  };

  Game.prototype.rotate = function (dir) {
    if (this.paused || this.gameOver || !this.current) return;
    var from = this.current.rotation;
    var to = (from + (dir > 0 ? 1 : 3)) % 4;
    for (var i = 0; i < KICKS.length; i++) {
      var kx = KICKS[i][0], ky = KICKS[i][1];
      var nx = this.current.x + kx, ny = this.current.y + ky;
      if (!this._collides(to, nx, ny)) {
        this.current.rotation = to;
        this.current.x = nx;
        this.current.y = ny;
        if (this.isLocking) this._bumpLockDelay();
        this._sfx('rotate');
        return true;
      }
    }
    return false;
  };

  Game.prototype.softDropStart = function () { this.softDropping = true; };
  Game.prototype.softDropStop = function () { this.softDropping = false; };

  Game.prototype.hardDrop = function () {
    if (this.paused || this.gameOver || !this.current) return;
    var dist = 0;
    while (!this._collides(this.current.rotation, this.current.x, this.current.y + 1)) {
      this.current.y++;
      dist++;
    }
    this.score += dist * 2;
    this._sfx('harddrop');
    this._lockPiece();
    this._afterScoreChange();
  };

  Game.prototype._lockPiece = function () {
    var cells = this.current.cells(this.current.rotation, this.current.x, this.current.y);
    for (var i = 0; i < cells.length; i++) {
      var cx = cells[i][0], cy = cells[i][1];
      if (cy >= 0 && cy < TOTAL_ROWS && cx >= 0 && cx < COLS) {
        this.board[cy][cx] = this.current.type;
      }
    }
    this.isLocking = false;
    this.lockAcc = 0;
    this._sfx('lock');

    if (this.current.isBomb && cells[this.current.bombCellIndex]) {
      var bombCell = cells[this.current.bombCellIndex];
      this._explodeBomb(bombCell[0], bombCell[1]);
    }

    var cleared = this._clearLines();
    if (!this.gameOver) {
      this._spawnNext(); // notifies 'spawn' internally (including isBomb flag) on success
    }
    return cleared;
  };

  // ---------- Bomb piece: explosion + column compaction ----------
  Game.prototype._explodeBomb = function (centerCol, centerRow) {
    var minC = Math.max(0, centerCol - BOMB_RADIUS);
    var maxC = Math.min(COLS - 1, centerCol + BOMB_RADIUS);
    var minR = Math.max(0, centerRow - BOMB_RADIUS);
    var maxR = Math.min(TOTAL_ROWS - 1, centerRow + BOMB_RADIUS);

    var clearedCount = 0;
    var touchedCols = {};
    for (var r = minR; r <= maxR; r++) {
      for (var c = minC; c <= maxC; c++) {
        var val = this.board[r][c];
        if (val) {
          this._spawnDustParticles(c, r, COLORS[val], true);
          this.board[r][c] = null;
          clearedCount++;
        }
        touchedCols[c] = true;
      }
    }
    // Bright central shockwave burst, distinct from the per-cell dust.
    this._spawnDustParticles(centerCol, centerRow, '#ffcc33', true, 10);

    // Cells above the gap must fall to fill it — compact each touched column.
    var cols = Object.keys(touchedCols);
    for (var i = 0; i < cols.length; i++) {
      this._compactColumn(parseInt(cols[i], 10));
    }

    if (clearedCount > 0) {
      var bonus = clearedCount * 30 * this.level;
      this.score += bonus;
      this._sfx('explosion');
      this._notify('bombexplode', { cleared: clearedCount, bonus: bonus, col: centerCol, row: centerRow });
    }
    return clearedCount;
  };

  Game.prototype._compactColumn = function (col) {
    var values = [];
    for (var r = 0; r < TOTAL_ROWS; r++) {
      if (this.board[r][col]) values.push(this.board[r][col]);
    }
    var emptyCount = TOTAL_ROWS - values.length;
    for (var i = 0; i < TOTAL_ROWS; i++) {
      this.board[i][col] = i < emptyCount ? null : values[i - emptyCount];
    }
  };

  Game.prototype.isNextBomb = function () {
    return !!(this.nextQueue[0] && this.nextQueue[0].isBomb);
  };

  Game.prototype._clearLines = function () {
    var fullRows = [];
    for (var r = 0; r < TOTAL_ROWS; r++) {
      var full = true;
      for (var c = 0; c < COLS; c++) {
        if (!this.board[r][c]) { full = false; break; }
      }
      if (full) fullRows.push(r);
    }
    if (fullRows.length === 0) return 0;

    // Spawn a soft "dust evaporating" particle burst for each cleared cell
    // before removing the rows — smoother and less jarring than a screen shake.
    for (var fr = 0; fr < fullRows.length; fr++) {
      var rowIdx = fullRows[fr];
      for (var c = 0; c < COLS; c++) {
        var cellType = this.board[rowIdx][c];
        if (cellType) this._spawnDustParticles(c, rowIdx, COLORS[cellType]);
      }
    }

    for (var i = 0; i < fullRows.length; i++) {
      this.board.splice(fullRows[i], 1);
      this.board.unshift(new Array(COLS).fill(null));
    }

    var n = fullRows.length;
    this.lines += n;
    var mult = [0, 100, 300, 500, 800][n] || 800;
    this.score += mult * this.level;

    var newLevel = this.startLevel + Math.floor(this.lines / 10);
    if (newLevel > this.level) {
      this.level = newLevel;
      this._sfx('levelup');
      this._notify('levelup', this.level);
    }

    if (n === 4) this._sfx('tetris'); else this._sfx('lineclear');
    this._notify('lineclear', { count: n, rows: fullRows });
    return n;
  };

  Game.prototype._afterScoreChange = function () {
    this._notify('score', { score: this.score, level: this.level, lines: this.lines });
  };

  Game.prototype._endGame = function () {
    this.gameOver = true;
    this.current = null;
    this.stop();
    this._sfx('gameover');
    this._notify('gameover', { score: this.score, level: this.level, lines: this.lines });
  };

  Game.prototype.pause = function () {
    if (this.gameOver) return;
    this.paused = true;
    this._notify('pause');
  };
  Game.prototype.resume = function () {
    if (this.gameOver) return;
    this.paused = false;
    this._lastTime = performance.now();
    this._notify('resume');
  };
  Game.prototype.togglePause = function () {
    if (this.paused) this.resume(); else this.pause();
  };

  Game.prototype._notify = function (evt, data) {
    if (this.callbacks[evt]) this.callbacks[evt](data);
  };
  Game.prototype._sfx = function (name) {
    if (this.callbacks.sfx) this.callbacks.sfx(name);
  };

  // ---------- Dust particles (line-clear effect) ----------
  Game.prototype._spawnDustParticles = function (col, row, color, isExplosion, countOverride) {
    var count = countOverride || (isExplosion ? 9 : 5);
    for (var i = 0; i < count; i++) {
      var angle = isExplosion ? (Math.random() * Math.PI * 2) : ((Math.random() * Math.PI) - Math.PI / 2);
      var speedBase = isExplosion ? (1.6 + Math.random() * 2.6) : (0.8 + Math.random() * 1.6);
      this.particles.push({
        x: col + 0.5,
        y: row + 0.5,
        vx: Math.sin(angle) * speedBase * (isExplosion ? 1 : 0.6),
        vy: isExplosion ? (Math.cos(angle) * speedBase) : (-Math.abs(Math.cos(angle)) * speedBase - 0.4),
        life: isExplosion ? (300 + Math.random() * 220) : (380 + Math.random() * 260),
        maxLife: isExplosion ? (300 + Math.random() * 220) : (380 + Math.random() * 260),
        color: color,
        size: isExplosion ? (0.18 + Math.random() * 0.18) : (0.12 + Math.random() * 0.14)
      });
    }
  };

  Game.prototype._updateParticles = function (dtMs) {
    if (this.particles.length === 0) return;
    var dt = dtMs / 1000;
    var gravity = 1.4; // gentle upward drift that settles, not a jerky pop
    var next = [];
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.life -= dtMs;
      if (p.life <= 0) continue;
      p.vy += gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      next.push(p);
    }
    this.particles = next;
  };

  // ---------- End game (manual) ----------
  Game.prototype.endGame = function () {
    if (this.gameOver) return;
    this._endGame();
  };

  // ---------- Ghost piece ----------
  Game.prototype._ghostY = function () {
    var y = this.current.y;
    while (!this._collides(this.current.rotation, this.current.x, y + 1)) y++;
    return y;
  };

  // ---------- Update / loop ----------
  Game.prototype._update = function (dtMs) {
    this._updateParticles(dtMs);
    if (this.paused || this.gameOver || !this.current) return;

    var interval = this.softDropping ? Math.min(this._gravityInterval(), 50) : this._gravityInterval();
    this.gravityAcc += dtMs;

    var grounded = this._isGrounded();

    if (grounded) {
      this.isLocking = true;
      this.lockAcc += dtMs;
      if (this.lockAcc >= LOCK_DELAY_MS || this.lockResets >= MAX_LOCK_RESETS) {
        this._lockPiece();
        this._afterScoreChange();
        this.gravityAcc = 0;
        return;
      }
    } else {
      this.isLocking = false;
      this.lockAcc = 0;
    }

    if (this.gravityAcc >= interval) {
      this.gravityAcc = 0;
      if (!this._collides(this.current.rotation, this.current.x, this.current.y + 1)) {
        this.current.y++;
        if (this.softDropping) {
          this.score += 1;
          this._afterScoreChange();
        }
      }
    }
  };

  Game.prototype.start = function () {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    var self = this;
    function frame(t) {
      if (!self._running) return;
      var dt = t - self._lastTime;
      self._lastTime = t;
      if (dt > 250) dt = 250; // clamp huge gaps (tab backgrounded)
      self._update(dt);
      self.render();
      self._rafId = requestAnimationFrame(frame);
    }
    this._rafId = requestAnimationFrame(frame);
  };

  Game.prototype.stop = function () {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  };

  // ---------- Rendering ----------
  Game.prototype.render = function () {
    if (!this.boardCtx) return;
    var ctx = this.boardCtx;
    var cvs = this.boardCanvas;
    var cell = cvs.width / COLS;
    var visibleOffset = HIDDEN_ROWS;

    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // background
    ctx.fillStyle = '#0b0b16';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    if (this.settings.showGrid !== false) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (var gx = 0; gx <= COLS; gx++) {
        ctx.beginPath();
        ctx.moveTo(gx * cell, 0);
        ctx.lineTo(gx * cell, cvs.height);
        ctx.stroke();
      }
      for (var gy = 0; gy <= VISIBLE_ROWS; gy++) {
        ctx.beginPath();
        ctx.moveTo(0, gy * cell);
        ctx.lineTo(cvs.width, gy * cell);
        ctx.stroke();
      }
    }

    // locked blocks
    for (var r = visibleOffset; r < TOTAL_ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var v = this.board[r][c];
        if (v) this._drawCell(ctx, c, r - visibleOffset, cell, COLORS[v]);
      }
    }

    if (this.current && !this.gameOver) {
      // Landing preview ("drop shadow") — on by default; toggle/opacity
      // configurable in Settings (this.settings.dropShadowEnabled/Opacity).
      if (this.settings.dropShadowEnabled !== false) {
        var gy = this._ghostY();
        var gcells = this.current.cells(this.current.rotation, this.current.x, gy);
        for (var i = 0; i < gcells.length; i++) {
          var gcx = gcells[i][0], gcy = gcells[i][1] - visibleOffset;
          if (gcy >= 0) this._drawCell(ctx, gcx, gcy, cell, COLORS[this.current.type], true);
        }
      }
      // active piece
      var cells = this.current.cells(this.current.rotation, this.current.x, this.current.y);
      for (var j = 0; j < cells.length; j++) {
        var cx = cells[j][0], cy = cells[j][1] - visibleOffset;
        if (cy < 0) continue;
        if (this.current.isBomb && j === this.current.bombCellIndex) {
          this._drawBombCell(ctx, cx, cy, cell);
        } else {
          this._drawCell(ctx, cx, cy, cell, COLORS[this.current.type]);
        }
      }
    }

    this._renderParticles(ctx, cell, visibleOffset);
    this._renderNext();
  };

  Game.prototype._renderParticles = function (ctx, cell, visibleOffset) {
    if (this.particles.length === 0) return;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var alpha = Math.max(0, p.life / p.maxLife);
      var py = p.y - visibleOffset;
      if (py < -1) continue;
      var px = p.x * cell;
      var pyPx = py * cell;
      var size = p.size * cell * (0.6 + alpha * 0.4);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, pyPx, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  };

  Game.prototype._drawCell = function (ctx, col, row, size, color, ghost) {
    this._drawCellPx(ctx, col * size, row * size, size, color, ghost);
  };

  Game.prototype._drawCellPx = function (ctx, x, y, size, color, ghost) {
    var pad = Math.max(1, size * 0.07);
    var w = size - pad * 2, h = size - pad * 2;
    var r = size * 0.16;

    if (ghost) {
      // Single "opacity" setting (0–1) drives both the fill and outline
      // alpha, scaled so the fill always stays subtler than the outline.
      var op = (this.settings && typeof this.settings.dropShadowOpacity === 'number')
        ? this.settings.dropShadowOpacity
        : 0.4;
      ctx.save();
      roundRectPath(ctx, x + pad, y + pad, w, h, r);
      // A soft, light fill makes the landing spot ("drop shadow") readable
      // at a glance, with a brighter outline so it still reads as an
      // outline rather than a solid (already-placed) block.
      ctx.fillStyle = color;
      ctx.globalAlpha = op * 0.3;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, size * 0.06);
      ctx.strokeStyle = color;
      ctx.globalAlpha = op * 0.9;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    ctx.save();
    roundRectPath(ctx, x + pad, y + pad, w, h, r);
    ctx.clip();

    // Beveled diagonal gradient: bright highlight to a deeper shade.
    var grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, lighten(color, 0.45));
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, darken(color, 0.4));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, size, size);

    // Soft top-left sheen for a glossy, 3D block feel.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(x + pad, y + pad);
    ctx.lineTo(x + size - pad, y + pad);
    ctx.lineTo(x + pad, y + size - pad);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Defined edge so blocks read cleanly against each other.
    ctx.save();
    roundRectPath(ctx, x + pad, y + pad, w, h, r);
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();
    ctx.restore();
  };

  // A dark, pulsing "bomb" cell — visually distinct from normal blocks so
  // the player can see and plan around it while the piece is falling.
  Game.prototype._drawBombCell = function (ctx, col, row, size) {
    var x = col * size, y = row * size;
    var pad = Math.max(1, size * 0.07);
    var w = size - pad * 2, h = size - pad * 2;
    var r = size * 0.16;
    var pulse = 0.5 + 0.5 * Math.sin((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 140);

    ctx.save();
    roundRectPath(ctx, x + pad, y + pad, w, h, r);
    ctx.clip();

    var grad = ctx.createRadialGradient(
      x + size / 2, y + size / 2, size * 0.05,
      x + size / 2, y + size / 2, size * 0.6
    );
    grad.addColorStop(0, '#3a0a0a');
    grad.addColorStop(1, '#1a0505');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, size, size);

    // Glowing fuse-spark core that pulses.
    ctx.fillStyle = 'rgba(255,' + Math.round(120 + pulse * 100) + ',40,' + (0.65 + pulse * 0.35) + ')';
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size * (0.16 + pulse * 0.06), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    ctx.save();
    roundRectPath(ctx, x + pad, y + pad, w, h, r);
    ctx.lineWidth = Math.max(1.5, size * 0.06);
    ctx.strokeStyle = '#ff9933';
    ctx.stroke();
    ctx.restore();
  };

  Game.prototype._renderNext = function () {
    if (this.nextTargets.length === 0) return;
    var item = this.nextQueue[0];
    for (var t = 0; t < this.nextTargets.length; t++) {
      this._renderNextTo(this.nextTargets[t].ctx, this.nextTargets[t].canvas, item);
    }
  };

  Game.prototype._renderNextTo = function (ctx, cvs, item) {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = '#0b0b16';
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    if (!item) return;
    var type = item.type;
    var shape = SHAPES[type];
    // Divide by 6, not the piece's own max span, so every piece (including
    // the 4-wide I-piece) keeps a comfortable margin inside the box instead
    // of nearly touching its edges.
    var cell = Math.floor(Math.min(cvs.width, cvs.height) / 6);
    var offsets = shape.states[0];
    var minX = 4, maxX = 0, minY = 4, maxY = 0;
    for (var i = 0; i < offsets.length; i++) {
      minX = Math.min(minX, offsets[i][0]); maxX = Math.max(maxX, offsets[i][0]);
      minY = Math.min(minY, offsets[i][1]); maxY = Math.max(maxY, offsets[i][1]);
    }
    var w = (maxX - minX + 1) * cell, h = (maxY - minY + 1) * cell;
    var startX = (cvs.width - w) / 2 - minX * cell;
    var startY = (cvs.height - h) / 2 - minY * cell;
    for (var j = 0; j < offsets.length; j++) {
      var px = startX + offsets[j][0] * cell;
      var py = startY + offsets[j][1] * cell;
      this._drawCellPx(ctx, px, py, cell, COLORS[type]);
    }

    if (item.isBomb) {
      var bx = cvs.width - cvs.width * 0.16;
      var by = cvs.height * 0.16;
      ctx.save();
      ctx.fillStyle = '#ff9933';
      ctx.beginPath();
      ctx.arc(bx, by, cvs.width * 0.11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0505';
      ctx.font = 'bold ' + Math.round(cvs.width * 0.14) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', bx, by + 1);
      ctx.restore();
    }
  };

  Game.prototype.getState = function () {
    return {
      score: this.score,
      level: this.level,
      lines: this.lines,
      gameOver: this.gameOver,
      paused: this.paused
    };
  };

  window.TetrisGame = {
    Game: Game,
    COLS: COLS,
    VISIBLE_ROWS: VISIBLE_ROWS,
    PIECE_KEYS: PIECE_KEYS,
    COLORS: COLORS
  };
})();
