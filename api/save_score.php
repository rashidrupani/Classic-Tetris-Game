<?php
/**
 * save_score.php — Accepts a JSON POST body { name, score, level, lines }
 * and, if valid, appends it to data/scores.json. Never trusts client input;
 * everything is re-validated server-side (see _scores_common.php).
 */
declare(strict_types=1);
require __DIR__ . '/_scores_common.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    tetris_error('Method not allowed.', 405);
}

if (!tetris_rate_limit_ok(tetris_client_ip(), 3)) {
    tetris_error('Too many submissions, please wait a moment.', 429);
}

$rawBody = file_get_contents('php://input');
if ($rawBody === false || $rawBody === '') {
    tetris_error('Empty request body.');
}
if (strlen($rawBody) > 4096) {
    tetris_error('Request too large.');
}

$input = json_decode($rawBody, true);
if (!is_array($input)) {
    tetris_error('Malformed JSON.');
}

$entry = tetris_sanitize_entry([
    'name'  => $input['name']  ?? '',
    'score' => $input['score'] ?? -1,
    'level' => $input['level'] ?? 0,
    'lines' => $input['lines'] ?? -1,
    'date'  => date('Y-m-d'),
]);

if ($entry === null) {
    tetris_error('Invalid score data.');
}

try {
    $scores = tetris_add_score($entry);
    tetris_json_response(['ok' => true, 'scores' => $scores]);
} catch (\Throwable $e) {
    tetris_error('Could not save score.', 500);
}
