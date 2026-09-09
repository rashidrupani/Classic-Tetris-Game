<?php
/**
 * _scores_common.php
 * Shared helpers for reading/writing data/scores.json safely.
 * Included by get_scores.php and save_score.php only — not a public endpoint.
 */
declare(strict_types=1);

// Never leak PHP errors/warnings to the client; always respond with JSON.
error_reporting(E_ALL);
ini_set('display_errors', '0');

define('TETRIS_DATA_DIR', __DIR__ . '/../data');
define('TETRIS_SCORES_FILE', TETRIS_DATA_DIR . '/scores.json');
define('TETRIS_RATELIMIT_FILE', TETRIS_DATA_DIR . '/ratelimit.json');
define('TETRIS_MAX_ENTRIES', 20);
define('TETRIS_NAME_MAX_LEN', 15);
define('TETRIS_MAX_SCORE', 20000000);   // generous absolute ceiling
define('TETRIS_MAX_LEVEL', 200);
define('TETRIS_MAX_LINES', 100000);

function tetris_json_response(array $payload, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function tetris_error(string $message, int $status = 400): void {
    tetris_json_response(['ok' => false, 'error' => $message], $status);
}

function tetris_ensure_data_dir(): bool {
    if (is_dir(TETRIS_DATA_DIR)) return is_writable(TETRIS_DATA_DIR);
    return @mkdir(TETRIS_DATA_DIR, 0775, true);
}

/**
 * Reads scores.json under a shared lock. Returns a clean array of entries
 * (never throws — malformed/missing files just yield an empty array).
 */
function tetris_read_scores(): array {
    if (!is_file(TETRIS_SCORES_FILE)) return [];
    $fh = @fopen(TETRIS_SCORES_FILE, 'r');
    if ($fh === false) return [];
    $data = [];
    if (flock($fh, LOCK_SH)) {
        $raw = stream_get_contents($fh);
        flock($fh, LOCK_UN);
        $decoded = json_decode((string)$raw, true);
        if (is_array($decoded)) {
            foreach ($decoded as $entry) {
                $clean = tetris_sanitize_entry($entry);
                if ($clean !== null) $data[] = $clean;
            }
        }
    }
    fclose($fh);
    return $data;
}

/**
 * Validates and re-normalizes a single stored/submitted entry.
 * Returns null if the entry is unusable.
 */
function tetris_sanitize_entry($entry): ?array {
    if (!is_array($entry)) return null;
    if (!isset($entry['name'], $entry['score'], $entry['level'], $entry['lines'])) return null;

    $name = tetris_sanitize_name((string)$entry['name']);
    if ($name === '') return null;

    if (!is_numeric($entry['score']) || !is_numeric($entry['level']) || !is_numeric($entry['lines'])) return null;

    $score = (int)$entry['score'];
    $level = (int)$entry['level'];
    $lines = (int)$entry['lines'];

    if ($score < 0 || $score > TETRIS_MAX_SCORE) return null;
    if ($level < 1 || $level > TETRIS_MAX_LEVEL) return null;
    if ($lines < 0 || $lines > TETRIS_MAX_LINES) return null;

    // Loose anti-cheat heuristic: even an all-Tetris run at max level caps
    // points per line cleared; reject scores wildly disproportionate to
    // lines cleared (allow generous headroom for soft/hard drop bonus).
    $maxPlausible = ($lines + 4) * 800 * max($level, 1) + 200000;
    if ($score > $maxPlausible) return null;

    $date = isset($entry['date']) && is_string($entry['date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $entry['date'])
        ? $entry['date']
        : date('Y-m-d');

    return [
        'name'  => $name,
        'score' => $score,
        'level' => $level,
        'lines' => $lines,
        'date'  => $date,
    ];
}

function tetris_sanitize_name(string $name): string {
    $name = trim($name);
    // Strip anything outside a conservative safe set to prevent injection
    // into the JSON file or downstream HTML rendering.
    $name = preg_replace('/[^A-Za-z0-9 _\-.]/', '', $name) ?? '';
    $name = trim($name);
    if ($name === '') $name = 'PLAYER';
    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, TETRIS_NAME_MAX_LEN);
    } else {
        $name = substr($name, 0, TETRIS_NAME_MAX_LEN);
    }
    return $name;
}

/**
 * Appends a new entry, re-sorts, truncates to top N, and writes back under
 * an exclusive lock so concurrent submissions can't corrupt the file.
 */
function tetris_add_score(array $entry): array {
    if (!tetris_ensure_data_dir()) {
        tetris_error('Server storage unavailable.', 500);
    }

    // Create the file if missing so flock() has something to lock.
    if (!is_file(TETRIS_SCORES_FILE)) {
        @file_put_contents(TETRIS_SCORES_FILE, '[]', LOCK_EX);
    }

    $fh = @fopen(TETRIS_SCORES_FILE, 'c+');
    if ($fh === false) {
        tetris_error('Server storage unavailable.', 500);
    }

    if (!flock($fh, LOCK_EX)) {
        fclose($fh);
        tetris_error('Server busy, try again.', 503);
    }

    $raw = stream_get_contents($fh);
    $decoded = json_decode((string)$raw, true);
    $scores = [];
    if (is_array($decoded)) {
        foreach ($decoded as $e) {
            $clean = tetris_sanitize_entry($e);
            if ($clean !== null) $scores[] = $clean;
        }
    }

    $scores[] = $entry;
    usort($scores, function ($a, $b) { return $b['score'] <=> $a['score']; });
    $scores = array_slice($scores, 0, TETRIS_MAX_ENTRIES);

    $json = json_encode($scores, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        flock($fh, LOCK_UN);
        fclose($fh);
        tetris_error('Failed to encode scores.', 500);
    }

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, $json);
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);

    return $scores;
}

/**
 * Very small per-IP rate limiter to slow down automated score spam.
 * Not cryptographically robust — just a courtesy speed bump appropriate
 * for a shared-hosting JSON-file backend.
 */
function tetris_rate_limit_ok(string $ip, int $minIntervalSeconds = 3): bool {
    if (!tetris_ensure_data_dir()) return true; // fail open rather than blocking gameplay
    if (!is_file(TETRIS_RATELIMIT_FILE)) {
        @file_put_contents(TETRIS_RATELIMIT_FILE, '{}', LOCK_EX);
    }
    $fh = @fopen(TETRIS_RATELIMIT_FILE, 'c+');
    if ($fh === false) return true;
    if (!flock($fh, LOCK_EX)) { fclose($fh); return true; }

    $raw = stream_get_contents($fh);
    $data = json_decode((string)$raw, true);
    if (!is_array($data)) $data = [];

    $key = substr(preg_replace('/[^a-zA-Z0-9.:]/', '', $ip) ?? 'unknown', 0, 64);
    $now = time();
    $ok = true;
    if (isset($data[$key]) && is_numeric($data[$key])) {
        if ($now - (int)$data[$key] < $minIntervalSeconds) $ok = false;
    }

    // Prune old entries so the file doesn't grow unbounded over long uptimes.
    foreach ($data as $k => $t) {
        if (!is_numeric($t) || $now - (int)$t > 3600) unset($data[$k]);
    }
    $data[$key] = $now;

    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, json_encode($data));
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);

    return $ok;
}

function tetris_client_ip(): string {
    return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
}
