/*
 * audio.js — Retro-style SFX and an original procedurally-generated
 * background loop, synthesized entirely with the Web Audio API.
 * No external audio files, no copyrighted music is used or reproduced.
 */
(function () {
  'use strict';

  function AudioManager() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicEnabled = true;
    this.sfxEnabled = true;
    this.volume = 0.6;
    this._musicTimer = null;
    this._musicStep = 0;
    this._unlocked = false;
    this._supported = !!(window.AudioContext || window.webkitAudioContext);
  }

  AudioManager.prototype._ensureContext = function () {
    if (!this._supported) return false;
    if (this.ctx) return true;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicEnabled ? 0.35 : 0;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxEnabled ? 1 : 0;
      this.sfxGain.connect(this.masterGain);
      return true;
    } catch (e) {
      this._supported = false;
      return false;
    }
  };

  // Must be called from a user-gesture handler (autoplay policy).
  AudioManager.prototype.unlock = function () {
    if (!this._ensureContext()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._unlocked = true;
  };

  AudioManager.prototype.setVolume = function (v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
  };
  AudioManager.prototype.setMusicEnabled = function (on) {
    this.musicEnabled = on;
    if (this.musicGain) this.musicGain.gain.value = on ? 0.35 : 0;
    if (on) this.startMusic(); else this.stopMusic();
  };
  AudioManager.prototype.setSfxEnabled = function (on) {
    this.sfxEnabled = on;
    if (this.sfxGain) this.sfxGain.gain.value = on ? 1 : 0;
  };

  // ---------- SFX ----------
  AudioManager.prototype._tone = function (freq, dur, type, gainVal, delay) {
    if (!this._ensureContext() || !this.sfxEnabled) return;
    var ctx = this.ctx;
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainVal || 0.25, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  // Short filtered white-noise burst — used for the bomb explosion "boom",
  // since a plain oscillator can't convincingly produce percussive noise.
  AudioManager.prototype._noiseBurst = function (dur, gainVal, delay) {
    if (!this._ensureContext() || !this.sfxEnabled) return;
    var ctx = this.ctx;
    var t0 = ctx.currentTime + (delay || 0);
    var bufferSize = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, t0);
    filter.frequency.exponentialRampToValueAtTime(180, t0 + dur);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  };

  var SFX = {
    move: function (a) { a._tone(220, 0.05, 'square', 0.12); },
    rotate: function (a) { a._tone(330, 0.06, 'square', 0.14); },
    lock: function (a) { a._tone(140, 0.07, 'triangle', 0.18); },
    harddrop: function (a) {
      a._tone(300, 0.05, 'square', 0.2);
      a._tone(120, 0.09, 'triangle', 0.2, 0.03);
    },
    lineclear: function (a) {
      a._tone(523, 0.09, 'square', 0.22);
      a._tone(659, 0.09, 'square', 0.22, 0.06);
    },
    tetris: function (a) {
      var notes = [523, 659, 784, 1046];
      for (var i = 0; i < notes.length; i++) a._tone(notes[i], 0.12, 'square', 0.24, i * 0.07);
    },
    levelup: function (a) {
      var notes = [392, 523, 659, 784];
      for (var i = 0; i < notes.length; i++) a._tone(notes[i], 0.1, 'triangle', 0.2, i * 0.05);
    },
    gameover: function (a) {
      var notes = [392, 330, 262, 196];
      for (var i = 0; i < notes.length; i++) a._tone(notes[i], 0.22, 'triangle', 0.22, i * 0.18);
    },
    pause: function (a) { a._tone(440, 0.08, 'sine', 0.15); },
    explosion: function (a) {
      a._noiseBurst(0.32, 0.4);
      a._tone(85, 0.28, 'sine', 0.32, 0.01);
      a._tone(55, 0.35, 'triangle', 0.2, 0.04);
    }
  };

  AudioManager.prototype.play = function (name) {
    if (!this._supported || !this._unlocked) return;
    var fn = SFX[name];
    if (fn) fn(this);
  };

  // ---------- Original procedural background music ----------
  // A simple original 16-step chiptune-style arpeggio pattern in A minor.
  // Not derived from or resembling any existing commercial Tetris score.
  var SCALE = [220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00]; // A minor-ish
  var PATTERN = [0, 2, 4, 2, 5, 4, 2, 0, 3, 5, 7, 5, 4, 2, 1, 0];
  var STEP_MS = 220;

  AudioManager.prototype.startMusic = function () {
    if (!this._ensureContext() || !this.musicEnabled || !this._unlocked) return;
    if (this._musicTimer) return; // already running
    var self = this;
    function playStep() {
      if (!self.musicEnabled) return;
      var idx = PATTERN[self._musicStep % PATTERN.length];
      var freq = SCALE[idx % SCALE.length];
      var ctx = self.ctx;
      var t0 = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.5, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + STEP_MS / 1000 * 0.9);
      osc.connect(gain);
      gain.connect(self.musicGain);
      osc.start(t0);
      osc.stop(t0 + STEP_MS / 1000);

      // light bass note every 4th step
      if (self._musicStep % 4 === 0) {
        var bass = ctx.createOscillator();
        var bgain = ctx.createGain();
        bass.type = 'sine';
        bass.frequency.setValueAtTime(freq / 4, t0);
        bgain.gain.setValueAtTime(0, t0);
        bgain.gain.linearRampToValueAtTime(0.4, t0 + 0.02);
        bgain.gain.exponentialRampToValueAtTime(0.001, t0 + STEP_MS / 1000 * 1.8);
        bass.connect(bgain);
        bgain.connect(self.musicGain);
        bass.start(t0);
        bass.stop(t0 + STEP_MS / 1000 * 1.8);
      }

      self._musicStep++;
    }
    this._musicTimer = setInterval(playStep, STEP_MS);
    playStep();
  };

  AudioManager.prototype.stopMusic = function () {
    if (this._musicTimer) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
  };

  window.TetrisAudio = { AudioManager: AudioManager };
})();
