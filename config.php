<?php
/**
 * config.php — Site-owner configuration.
 *
 * Paste any code you want injected into the page here — Google AdSense,
 * Google Analytics / GA4, Search Console verification tags, or any other
 * <head> / pre-</body> snippet. This file is never sent to the browser as
 * text; only whatever HTML/JS you put inside the two variables below gets
 * rendered, exactly where indicated.
 *
 * Leave a variable as an empty string to inject nothing.
 */
declare(strict_types=1);

// Injected just before </head> on every page (ad network header scripts,
// analytics tags, meta/verification tags, custom <style>, etc.)
$TETRIS_HEADER_CODE = <<<'HTML'
HTML;

// Injected just before </body> on every page (e.g. ad scripts that should
// load late, or chat widgets).
$TETRIS_FOOTER_CODE = <<<'HTML'
HTML;
