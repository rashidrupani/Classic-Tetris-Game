<?php
/**
 * index.php
 * Single-page shell for Classic Tetris. PHP's only job here is to read the
 * existing scores.json (if present) so the High Scores screen can paint
 * instantly without an extra round trip. All gameplay is client-side.
 */
declare(strict_types=1);

// Reuse the exact same read/validate logic the API uses, so the
// server-rendered initial list can never drift out of sync with it.
require __DIR__ . '/api/_scores_common.php';

// Site-owner injectable header/footer code (ads, analytics, etc). Optional —
// the file ships with both left blank.
$TETRIS_HEADER_CODE = '';
$TETRIS_FOOTER_CODE = '';
if (is_file(__DIR__ . '/config.php')) {
    require __DIR__ . '/config.php';
}

$initialScores = tetris_read_scores();
usort($initialScores, function ($a, $b) { return $b['score'] <=> $a['score']; });
$initialScores = array_slice($initialScores, 0, TETRIS_MAX_ENTRIES);
$initialScoresJson = json_encode($initialScores, JSON_UNESCAPED_UNICODE);
$topScore = $initialScores[0] ?? null;

// Cache-busting: append each asset's last-modified time as a version query
// string, so every update is picked up immediately instead of being served
// from a stale browser/host cache. This is the #1 cause of "I updated the
// files but nothing changed" reports.
function tetris_asset_url(string $relPath): string {
    $full = __DIR__ . '/' . ltrim($relPath, '/');
    $v = is_file($full) ? filemtime($full) : time();
    return $relPath . '?v=' . $v;
}
?><!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#05050a">
<title>Classic Tetris — Play Free Online, with Bomb Pieces</title>
<meta name="description" content="A classic 90s-style Tetris rebuilt for the modern web — bomb pieces, global high scores, full mobile support. Free to play, no download, no signup.">
<link rel="canonical" href="https://games.ouchh.com/tetris/">
<link rel="icon" type="image/png" sizes="32x32" href="<?= tetris_asset_url('assets/favicon-32.png') ?>">
<link rel="icon" type="image/png" sizes="16x16" href="<?= tetris_asset_url('assets/favicon-16.png') ?>">
<link rel="icon" href="<?= tetris_asset_url('assets/favicon.ico') ?>">
<link rel="apple-touch-icon" sizes="180x180" href="<?= tetris_asset_url('assets/apple-touch-icon.png') ?>">
<link rel="manifest" href="<?= tetris_asset_url('manifest.json') ?>">

<!-- Open Graph / social sharing preview (Twitter/X, Discord, WhatsApp, Facebook, etc.) -->
<meta property="og:type" content="website">
<meta property="og:title" content="Classic Tetris — Play Free Online">
<meta property="og:description" content="A classic 90s-style Tetris rebuilt for the modern web — bomb pieces, global high scores, full mobile support.">
<meta property="og:url" content="https://games.ouchh.com/tetris/">
<meta property="og:image" content="https://games.ouchh.com/tetris/assets/social-preview.png">
<meta property="og:site_name" content="Ouchh.com Studio">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Classic Tetris — Play Free Online">
<meta name="twitter:description" content="A classic 90s-style Tetris rebuilt for the modern web — bomb pieces, global high scores, full mobile support.">
<meta name="twitter:image" content="https://games.ouchh.com/tetris/assets/social-preview.png">

<link rel="stylesheet" href="<?= tetris_asset_url('assets/css/style.css') ?>">
<?= $TETRIS_HEADER_CODE ?>
</head>
<body>
<div id="app">

  <!-- ============ MAIN MENU ============ -->
  <section id="screen-menu" class="screen">
    <div class="menu-decor" aria-hidden="true">
      <span class="decor-block c1"></span><span class="decor-block c2"></span>
      <span class="decor-block c3"></span><span class="decor-block c4"></span>
      <span class="decor-block c5"></span><span class="decor-block c6"></span>
    </div>

    <div class="title-block">
      <h1>TETRIS</h1>
      <div class="subtitle">CLASSIC EDITION</div>
      <div class="subtitle-2">now with bomb blocks 💣</div>
    </div>

    <?php if ($topScore): ?>
    <div class="top-score-teaser">
      <span class="tst-label">TOP SCORE</span>
      <span class="tst-value"><?= number_format((int)$topScore['score']) ?></span>
      <span class="tst-name"><?= htmlspecialchars($topScore['name'], ENT_QUOTES, 'UTF-8') ?></span>
    </div>
    <?php else: ?>
    <div class="top-score-teaser tst-empty">
      <span class="tst-label">No high scores yet — be the first!</span>
    </div>
    <?php endif; ?>

    <div class="name-entry">
      <label for="input-player-name-menu">PLAYER NAME</label>
      <input type="text" id="input-player-name-menu" maxlength="15" placeholder="PLAYER 1">
    </div>
    <nav class="menu-buttons">
      <button id="btn-start" class="pixel-btn primary">START GAME</button>
      <button id="btn-highscores" class="pixel-btn">HIGH SCORES</button>
      <button id="btn-settings" class="pixel-btn">SETTINGS</button>
      <button id="btn-howtoplay" class="pixel-btn">HOW TO PLAY</button>
    </nav>
  </section>

  <!-- ============ GAME SCREEN ============ -->
  <section id="screen-game" class="screen">
    <div class="game-shell">

      <aside class="panel panel-left">
        <div class="panel-title">HOW TO PLAY</div>
        <ul class="mini-howto">
          <li><span>Move</span><kbd>← →</kbd></li>
          <li><span>Rotate</span><kbd>↑ / W</kbd></li>
          <li><span>Soft Drop</span><kbd>↓ / S</kbd></li>
          <li><span>Hard Drop</span><kbd>SPACE</kbd></li>
          <li><span>Pause</span><kbd>P</kbd></li>
          <li><span>Restart</span><kbd>R</kbd></li>
        </ul>
        <div class="mini-howto bomb-note">
          <ul style="list-style:none;margin:0;padding:0;">
            <li style="justify-content:flex-start;gap:8px;">💣 <span>Bomb pieces explode on landing — clear the blocks around them!</span></li>
          </ul>
        </div>
        <div class="panel-stats">
          <div class="hud-box hud-score"><div class="hud-label">SCORE</div><div class="hud-value" id="hud-score">0</div></div>
          <div class="hud-box hud-level"><div class="hud-label">LEVEL</div><div class="hud-value" id="hud-level">1</div></div>
          <div class="hud-box hud-lines"><div class="hud-label">LINES</div><div class="hud-value" id="hud-lines">0</div></div>
        </div>
      </aside>

      <div class="board-col">
        <div class="next-standalone" id="next-standalone">
          <div class="hud-label">NEXT</div>
          <canvas id="next-canvas" width="100" height="100"></canvas>
        </div>

        <div id="board-wrap">
          <canvas id="board-canvas" width="300" height="600"></canvas>
          <div id="board-touch-zone"></div>

          <div id="pause-overlay" class="overlay">
            <h2>PAUSED</h2>
            <button id="btn-resume" class="pixel-btn primary">RESUME</button>
            <button id="btn-restart-ingame" class="pixel-btn">RESTART</button>
            <button id="btn-quit-ingame" class="pixel-btn danger">QUIT TO MENU</button>
          </div>

          <div id="gameover-overlay" class="overlay">
            <h2>GAME OVER</h2>
            <div class="go-stats">
              <div class="go-name" id="go-name">PLAYER</div>
              <div class="go-row">SCORE <b id="go-score">0</b></div>
              <div class="go-row">LEVEL <b id="go-level">1</b></div>
              <div class="go-row">LINES <b id="go-lines">0</b></div>
            </div>
            <div id="go-submit-row">
              <button id="btn-go-submit" class="pixel-btn small">SUBMIT SCORE</button>
            </div>
            <button id="btn-go-playagain" class="pixel-btn primary">PLAY AGAIN</button>
            <button id="btn-go-highscores" class="pixel-btn small">HIGH SCORES</button>
            <button id="btn-go-menu" class="pixel-btn small">MAIN MENU</button>
          </div>
        </div>
      </div>

      <aside class="panel panel-right">
        <div class="player-badge">
          <div class="hud-label">PLAYER</div>
          <div class="hud-value" id="hud-playername">PLAYER 1</div>
        </div>

        <div class="mobile-stats">
          <div class="mobile-stat"><span id="hud-score-mobile">0</span><label>SCORE</label></div>
          <div class="mobile-stat"><span id="hud-level-mobile">1</span><label>LVL</label></div>
          <div class="mobile-stat"><span id="hud-lines-mobile">0</span><label>LINES</label></div>
        </div>

        <div class="next-standalone next-standalone-mobile" id="next-standalone-mobile">
          <div class="hud-label">NEXT</div>
          <canvas id="next-canvas-mobile" width="100" height="100"></canvas>
        </div>

        <div class="control-stack">
          <div class="control-stack-title">CONTROLS</div>

          <div class="lr-row">
            <button id="btn-left" class="ctrl-btn c-cyan" aria-label="Move left">◀<span>LEFT</span></button>
            <button id="btn-right" class="ctrl-btn c-cyan" aria-label="Move right">▶<span>RIGHT</span></button>
          </div>

          <button id="btn-down" class="ctrl-btn c-green" aria-label="Soft drop">▼<span>SOFT</span></button>
          <button id="btn-rotate" class="ctrl-btn c-yellow" aria-label="Rotate">⟳<span>ROTATE</span></button>

          <div class="joystick-wrap">
            <div id="joystick-base"><div id="joystick-knob"></div></div>
          </div>

          <button id="btn-harddrop" class="ctrl-btn c-magenta" aria-label="Hard drop">⤓<span>DROP</span></button>
          <button id="btn-pause" class="ctrl-btn c-orange" aria-label="Pause">❚❚<span>PAUSE</span></button>
          <button id="btn-end-game" class="ctrl-btn c-red" aria-label="End game">■<span>END GAME</span></button>
          <button id="btn-fullscreen" class="ctrl-btn c-neutral" aria-label="Fullscreen">⛶<span>FULL</span></button>
        </div>
      </aside>

    </div>
  </section>

  <!-- ============ SETTINGS ============ -->
  <section id="screen-settings" class="screen">
    <div class="panel-card">
      <h2>SETTINGS</h2>

      <h3>PLAYER</h3>
      <div class="field-row">
        <label for="input-player-name">Player Name</label>
        <input type="text" id="input-player-name" maxlength="15" placeholder="PLAYER">
      </div>

      <h3>SOUND</h3>
      <div class="field-row">
        <label for="toggle-music">Music</label>
        <label class="switch"><input type="checkbox" id="toggle-music"><span class="slider"></span></label>
      </div>
      <div class="field-row">
        <label for="toggle-sfx">Sound Effects</label>
        <label class="switch"><input type="checkbox" id="toggle-sfx"><span class="slider"></span></label>
      </div>
      <div class="field-row">
        <label for="range-volume">Master Volume</label>
        <input type="range" id="range-volume" min="0" max="100" value="60">
      </div>

      <h3>GAMEPLAY</h3>
      <div class="field-row">
        <label for="select-start-level">Starting Level</label>
        <select id="select-start-level">
          <?php for ($i = 1; $i <= 20; $i++): ?>
          <option value="<?= $i ?>"><?= $i ?></option>
          <?php endfor; ?>
        </select>
      </div>
      <div class="field-row">
        <label for="toggle-dropshadow">Drop Shadow</label>
        <label class="switch"><input type="checkbox" id="toggle-dropshadow"><span class="slider"></span></label>
      </div>
      <div class="field-row">
        <label for="range-dropshadow-opacity">Drop Shadow Opacity</label>
        <input type="range" id="range-dropshadow-opacity" min="0" max="100" value="40">
      </div>

      <h3>CONTROLS</h3>
      <div class="field-row">
        <label for="select-control-layout">Keyboard Layout</label>
        <select id="select-control-layout">
          <option value="arrows">Arrow Keys</option>
          <option value="wasd">WASD</option>
        </select>
      </div>

      <h3>DISPLAY</h3>
      <div class="field-row">
        <label for="toggle-crt">CRT Effect</label>
        <label class="switch"><input type="checkbox" id="toggle-crt"><span class="slider"></span></label>
      </div>
      <div class="field-row">
        <label for="toggle-shake">Impact Glow (Game Over)</label>
        <label class="switch"><input type="checkbox" id="toggle-shake"><span class="slider"></span></label>
      </div>
      <div class="field-row">
        <label for="toggle-animations">Animations</label>
        <label class="switch"><input type="checkbox" id="toggle-animations"><span class="slider"></span></label>
      </div>
      <div class="field-row">
        <label for="toggle-grid">Block Grid</label>
        <label class="switch"><input type="checkbox" id="toggle-grid"><span class="slider"></span></label>
      </div>

      <div class="menu-buttons" style="margin-top:20px;">
        <button class="pixel-btn btn-back">BACK</button>
      </div>
    </div>
  </section>

  <!-- ============ HIGH SCORES ============ -->
  <section id="screen-highscores" class="screen">
    <div class="panel-card">
      <h2>HIGH SCORES</h2>
      <ul class="highscores-list" id="highscores-list"></ul>
      <div id="hs-source-note"></div>
      <div class="menu-buttons" style="margin-top:20px;">
        <button class="pixel-btn btn-back">BACK</button>
      </div>
    </div>
  </section>

  <!-- ============ HOW TO PLAY ============ -->
  <section id="screen-howtoplay" class="screen">
    <div class="panel-card">
      <h2>HOW TO PLAY</h2>
      <div class="howto-list">
        <div><kbd>←</kbd> <kbd>→</kbd> — Move</div>
        <div><kbd>↑</kbd> / <kbd>W</kbd> — Rotate</div>
        <div><kbd>↓</kbd> / <kbd>S</kbd> — Soft Drop</div>
        <div><kbd>SPACE</kbd> — Hard Drop</div>
        <div><kbd>P</kbd> — Pause</div>
        <div><kbd>R</kbd> — Restart</div>
      </div>
      <h3>MOBILE</h3>
      <div class="howto-list">
        <div>Tap the on-screen buttons, or use the on-screen joystick to move.</div>
        <div>Swipe left/right to move, swipe down to soft drop, a fast long swipe down hard-drops, tap the board to rotate.</div>
      </div>
      <h3>DURING A GAME</h3>
      <div class="howto-list">
        <div>Your name is shown on the right panel throughout the game.</div>
        <div>PAUSE stops the game and lets you resume, restart, or quit.</div>
        <div>END GAME finishes the current run immediately and takes you straight to the Game Over screen, where you can submit your score.</div>
      </div>
      <h3>SCORING</h3>
      <div class="howto-list">
        <div>Single = 100 × level &nbsp; Double = 300 × level</div>
        <div>Triple = 500 × level &nbsp; Tetris = 800 × level</div>
        <div>Soft drop = 1 pt/cell &nbsp; Hard drop = 2 pt/cell</div>
      </div>
      <h3>💣 BOMB PIECES</h3>
      <div class="howto-list">
        <div>Every so often, a piece has one glowing red-orange cell — that's a bomb.</div>
        <div>When it lands, it explodes and clears a 3×3 area around it, dropping everything above down to fill the gap — chain into fresh line clears for bonus points!</div>
      </div>
      <div class="menu-buttons" style="margin-top:20px;">
        <button class="pixel-btn btn-back">BACK</button>
      </div>
    </div>
  </section>

</div>

<footer class="site-footer" id="site-footer">
  Made with <span class="heart">♥</span> by
  <a href="https://ouchh.com" target="_blank" rel="noopener noreferrer">Ouchh.com Studio</a>
  — Rashid Rupani
</footer>

<script>
  // Server-rendered initial high scores, so the High Scores screen has
  // something to show immediately even before the async fetch resolves.
  window.__TETRIS_INITIAL_SCORES__ = <?= $initialScoresJson ?: '[]' ?>;
</script>
<script src="<?= tetris_asset_url('assets/js/storage.js') ?>"></script>
<script src="<?= tetris_asset_url('assets/js/audio.js') ?>"></script>
<script src="<?= tetris_asset_url('assets/js/game.js') ?>"></script>
<script src="<?= tetris_asset_url('assets/js/input.js') ?>"></script>
<script src="<?= tetris_asset_url('assets/js/ui.js') ?>"></script>
<?= $TETRIS_FOOTER_CODE ?>
</body>
</html>
