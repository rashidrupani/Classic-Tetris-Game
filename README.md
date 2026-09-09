<div align="center">

# 🕹️ Classic Tetris — Web Edition

**A pixel-perfect, 90s-style Tetris rebuilt for the modern web — with bomb pieces.**

[![Play Now](https://img.shields.io/badge/▶_PLAY_NOW-games.ouchh.com%2Ftetris-ff9900?style=for-the-badge)](https://games.ouchh.com/tetris/)
[![CI](https://github.com/rashidrupani/Classic-Tetris-Game/actions/workflows/ci.yml/badge.svg)](https://github.com/rashidrupani/Classic-Tetris-Game/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-00f0f0?style=flat-square)](LICENSE)
[![PHP](https://img.shields.io/badge/PHP-8.x-777bb4?style=flat-square&logo=php&logoColor=white)](https://php.net)
[![No build step](https://img.shields.io/badge/build_step-none-00f000?style=flat-square)](#tech-stack)
[![No framework](https://img.shields.io/badge/framework-vanilla_JS-f000f0?style=flat-square)](#tech-stack)

### 🎮 [**games.ouchh.com/tetris**](https://games.ouchh.com/tetris/) 🎮

</div>

---

## Why this Tetris

Most "modern" Tetris clones either lose the classic feel chasing a trendy
framework, or they're a barebones tutorial project that falls apart under
real play. This one is neither:

- **Genuinely classic** — 7-bag randomizer, proper wall-kicks, lock delay,
  authentic scoring, real level-speed curve.
- **Actually finished** — pause, resume, restart, end-game, settings that
  persist, a working global high-score board, full mobile support.
- **One extra twist** — 💣 **bomb pieces**. Roughly 1 in 8 pieces is a bomb;
  land it and it blows a 3×3 hole in the stack, drops everything above down
  to fill the gap, and can chain straight into a fresh line clear.
- **Runs anywhere** — plain PHP + vanilla JS. No Node, no database, no
  build step, no framework. Upload it to $5/month shared hosting and it
  just works.

## Features

| | |
|---|---|
| 🧱 Classic mechanics | 7-bag randomizer, SRS-style rotation with wall-kicks, lock delay, ghost/drop-shadow landing preview |
| 💣 Bomb pieces | 3×3 explosion, column-compaction physics, chain-reaction line clears, dust-particle effects |
| 🏆 High scores | Global leaderboard (PHP + JSON, `flock()`-safe) with automatic LocalStorage fallback if offline |
| 📱 Mobile-first controls | Big joystick, large touch targets, press-and-hold-to-drop, swipe gestures |
| 🎨 Retro-but-modern visuals | Beveled/gradient blocks, CRT scanline effect, neon glow theme, smooth canvas particle effects (no screen-shake jank) |
| 🔊 Zero-asset audio | All SFX and the background loop are synthesized live with the Web Audio API — no MP3s shipped |
| ⚙️ Deep settings | Starting level, keyboard layout, drop-shadow opacity, CRT/animation toggles, all persisted |
| 💰 Monetization-ready | `config.php` lets you drop in AdSense/Analytics without touching game code |

## Screenshots

> Add a few gameplay screenshots or a short GIF here — drag-and-drop
> images into this README on GitHub and they'll embed automatically.
> A good social preview image is set in `assets/social-preview.png` /
> Settings → Social Preview on the repo itself.

## Tech stack

- **Frontend:** vanilla HTML5 Canvas + CSS3 + JavaScript (ES5-compatible,
  no build tools, no bundler, no npm dependency at runtime)
- **Backend:** PHP 8.x, flat JSON file storage (no database)
- **Audio:** Web Audio API (oscillator-synthesized, no audio files)

If you're picturing a React/Vite/Webpack pipeline — there isn't one. Clone
it, open `index.php` in a PHP-capable server, and you're playing.

## Run it locally

```bash
git clone https://github.com/rashidrupani/Classic-Tetris-Game.git
cd Classic-Tetris-Game
php -S localhost:8000
```

Then open **http://localhost:8000** in your browser.

## Deploy to shared hosting

1. Upload the whole repo to your hosting account (FTP, file manager, git
   deploy — whatever your host supports), e.g. `public_html/tetris/`.
2. Make the `data/` folder writable by the web server:
   ```bash
   chmod 775 data/
   ```
   (the app creates `data/scores.json` automatically on first score
   submission — you don't need to create it yourself)
3. Open `index.php` in a browser, e.g. `https://yourdomain.com/tetris/`.

No database, no cron jobs, no SSH required. Apache (or anything that
respects `.htaccess`) is recommended so `data/.htaccess` can block direct
requests to the raw JSON file; on Nginx add an equivalent `location`
block denying `/data/`.

## Project layout

```
.
├── config.php                  Optional: paste AdSense/Analytics code here
├── index.php                   Page shell, embeds initial high scores, cache-busting
├── assets/
│   ├── css/style.css           All styling — responsive layout, CRT effect, theming
│   └── js/
│       ├── game.js             Core engine: board, pieces, physics, scoring, bombs
│       ├── input.js            Keyboard, mouse, touch, swipe, joystick, long-press
│       ├── audio.js            Web Audio API SFX + procedural music loop
│       ├── ui.js                Screens, HUD, settings, wiring
│       └── storage.js           localStorage + API client with graceful fallback
├── api/
│   ├── _scores_common.php      Shared validation/locking helpers
│   ├── get_scores.php          GET current high scores
│   └── save_score.php          POST a new score (validated + rate-limited)
└── data/
    ├── scores.json              Top-20 high-score table (auto-created)
    └── .htaccess                 Blocks direct HTTP access to the JSON file
```

## How the extras work

<details>
<summary><b>💣 Bomb pieces</b></summary>

Roughly 1 in 8 spawned pieces carries a bomb on one random cell (shown as a
pulsing red-orange cell while falling, plus an "!" badge on the NEXT
preview). When it locks, it explodes in a 3×3 area: cleared cells spawn
dust particles, everything above the blast falls to fill the gap
(column-compaction), and any row that becomes full afterward clears
normally — so a well-placed bomb can chain into bonus points.
</details>

<details>
<summary><b>🏆 High scores & offline fallback</b></summary>

Scores POST to `api/save_score.php`, which validates name/score/level/lines
server-side (never trusts the client), rate-limits by IP, and writes under
an exclusive `flock()`. If the API is unreachable for any reason, the game
transparently falls back to the browser's LocalStorage and tells you so —
it never blocks play, and it never silently pretends a save worked when it
didn't.
</details>

<details>
<summary><b>⚙️ Admin header/footer injection</b></summary>

Edit `config.php` and paste anything into `$TETRIS_HEADER_CODE` (rendered
before `</head>` — AdSense, GA4, verification tags) or
`$TETRIS_FOOTER_CODE` (before `</body>`). Both are blank by default.
</details>

<details>
<summary><b>🖱️ Controls</b></summary>

**Keyboard:** Arrow keys or WASD to move/rotate/soft-drop, `Space` to hard
drop, `P` to pause, `R` to restart.

**Desktop:** on-screen buttons for every action, plus an optional joystick.

**Mobile:** joystick + soft-drop + drop + pause + end-game in a big-button
bottom bar; swipe to move, tap the board to rotate, press-and-hold ~2s to
hard-drop.
</details>

<details>
<summary><b>🩺 High scores not saving after deploy?</b></summary>

The High Scores screen shows *why* it's falling back to local scores,
right under the list:

- **"server unreachable: HTTP ..."** — `data/` isn't writable by the web
  server user. Re-run `chmod 775 data/` and check your host's file-manager
  permissions UI.
- **"server unreachable: timeout"** — the `api/` folder didn't upload
  correctly, or isn't reachable at that relative path. Open
  `yourdomain.com/tetris/api/get_scores.php` directly — it should return
  `{"ok":true,"scores":[...]}`.
- **"This browser/embed is blocking local storage..."** — you're viewing
  the page inside a sandboxed preview/iframe that disallows
  `localStorage`. Open it in a normal browser tab.
</details>

## Contributing

Issues and PRs welcome. This project intentionally has **no build step** —
please keep it that way (plain ES5-ish JS, no bundler, no framework) so it
stays a drop-in deploy for anyone on basic shared hosting.

## License

[MIT](LICENSE) — do whatever you want with it, credit appreciated but not required.

---

<div align="center">

Made with ❤️ by **[Ouchh.com Studio](https://ouchh.com)** — Rashid Rupani

⭐ **If you enjoyed this, a star on the repo helps other people find it.**

</div>
