<?php
/**
 * get_scores.php — Returns the current top scores as JSON.
 * GET only. Always responds with a valid JSON payload, even on error,
 * so the client can fall back to LocalStorage cleanly.
 */
declare(strict_types=1);
require __DIR__ . '/_scores_common.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    tetris_error('Method not allowed.', 405);
}

try {
    $scores = tetris_read_scores();
    usort($scores, function ($a, $b) { return $b['score'] <=> $a['score']; });
    $scores = array_slice($scores, 0, TETRIS_MAX_ENTRIES);
    tetris_json_response(['ok' => true, 'scores' => $scores]);
} catch (\Throwable $e) {
    // Never leak internals; degrade to an empty (still valid) list.
    tetris_json_response(['ok' => true, 'scores' => []]);
}
