<?php
declare(strict_types=1);

const MATCH_TTL_SECONDS = 2592000; // 30 days
const MAX_BODY_BYTES = 1048576;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

$dataDir = __DIR__ . DIRECTORY_SEPARATOR . 'data';
if (!is_dir($dataDir) && !mkdir($dataDir, 0700, true) && !is_dir($dataDir)) {
    respond(500, ['error' => 'Match storage is unavailable']);
}

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, X-Player-Token');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Cache-Control: no-store');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$action = isset($_GET['action']) ? (string) $_GET['action'] : 'health';
$code = isset($_GET['code']) ? strtoupper(trim((string) $_GET['code'])) : '';

try {
    if ($action === 'health' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        respond(200, ['ok' => true, 'service' => 'word-wars-api', 'storage' => 'file', 'version' => 1]);
    }

    if ($action === 'create' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        cleanupOldMatches($dataDir);
        $body = requestBody();
        $hostName = playerName($body['hostName'] ?? 'Player 1');
        $minimum = (int) ($body['minWordLength'] ?? 3);
        if (!in_array($minimum, [3, 4, 5], true)) $minimum = 3;
        $rawToken = makeToken();

        for ($attempt = 0; $attempt < 50; $attempt++) {
            $newCode = makeCode();
            $path = matchPath($dataDir, $newCode);
            $handle = @fopen($path, 'x');
            if ($handle === false) continue;
            $match = [
                'code' => $newCode,
                'status' => 'waiting',
                'hostName' => $hostName,
                'minWordLength' => $minimum,
                'tokenHashes' => [hash('sha256', $rawToken), null],
                'state' => null,
                'revision' => 1,
                'updatedAt' => time()
            ];
            fwrite($handle, encode($match));
            fclose($handle);
            respond(201, array_merge(publicMatch($match), [
                'playerIndex' => 0,
                'playerToken' => $rawToken
            ]));
        }
        respond(503, ['error' => 'Could not allocate a battle code']);
    }

    if (!preg_match('/^[A-Z2-9]{6}$/', $code)) respond(400, ['error' => 'Invalid battle code']);

    if ($action === 'get' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $match = readMatch($dataDir, $code);
        $index = authenticatedPlayer($match);
        $response = publicMatch($match);
        if ($index >= 0) {
            $response['state'] = $match['state'];
            $response['playerIndex'] = $index;
        }
        respond(200, $response);
    }

    if ($action === 'join' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = requestBody();
        $joiningName = playerName($body['name'] ?? 'Player 2');
        $initialState = validState($body['state'] ?? null);
        $rawToken = makeToken();
        $result = updateMatch($dataDir, $code, function (array &$match) use ($joiningName, $initialState, $rawToken): array {
            if ($match['status'] !== 'waiting') fail(409, 'Battle already has two players');
            $initialState['players'][0]['name'] = $match['hostName'];
            $initialState['players'][1]['name'] = $joiningName;
            $match['tokenHashes'][1] = hash('sha256', $rawToken);
            $match['state'] = $initialState;
            $match['status'] = 'active';
            $match['revision']++;
            $match['updatedAt'] = time();
            return array_merge(publicMatch($match), [
                'state' => $match['state'],
                'playerIndex' => 1,
                'playerToken' => $rawToken
            ]);
        });
        respond(200, $result);
    }

    if ($action === 'state' && $_SERVER['REQUEST_METHOD'] === 'PUT') {
        $body = requestBody();
        $submittedState = validState($body['state'] ?? null);
        $submittedRevision = (int) ($body['revision'] ?? 0);
        $result = updateMatch($dataDir, $code, function (array &$match) use ($submittedState, $submittedRevision): array {
            $index = authenticatedPlayer($match);
            if ($index < 0) fail(401, 'Invalid player token');
            if ($submittedRevision !== (int) $match['revision']) {
                fail(409, 'Match changed', array_merge(publicMatch($match), ['state' => $match['state']]));
            }
            if (is_array($match['state']) && (int) ($match['state']['current'] ?? -1) !== $index) {
                fail(403, 'It is not your turn');
            }
            $submittedState['players'][0]['name'] = $match['state']['players'][0]['name'];
            $submittedState['players'][1]['name'] = $match['state']['players'][1]['name'];
            $match['state'] = $submittedState;
            $match['status'] = empty($submittedState['outcome']) ? 'active' : 'finished';
            $match['revision']++;
            $match['updatedAt'] = time();
            return array_merge(publicMatch($match), ['state' => $match['state'], 'playerIndex' => $index]);
        });
        respond(200, $result);
    }

    respond(404, ['error' => 'Not found']);
} catch (ApiException $error) {
    respond($error->status, array_merge(['error' => $error->getMessage()], $error->extra));
} catch (Throwable $error) {
    error_log($error->__toString());
    respond(500, ['error' => 'Unexpected server error']);
}

final class ApiException extends RuntimeException {
    public int $status;
    public array $extra;
    public function __construct(int $status, string $message, array $extra = []) {
        parent::__construct($message);
        $this->status = $status;
        $this->extra = $extra;
    }
}

function fail(int $status, string $message, array $extra = []): void {
    throw new ApiException($status, $message, $extra);
}

function respond(int $status, array $body): void {
    http_response_code($status);
    echo encode($body);
    exit;
}

function encode(array $value): string {
    return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
}

function requestBody(): array {
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > MAX_BODY_BYTES) fail(413, 'Request too large');
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) fail(413, 'Request too large');
    if ($raw === '') return [];
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) fail(400, 'Invalid JSON');
    return $decoded;
}

function playerName($value): string {
    $name = trim((string) $value);
    if ($name === '') return 'Player';
    return function_exists('mb_substr') ? mb_substr($name, 0, 16) : substr($name, 0, 16);
}

function validState($state): array {
    if (!is_array($state) || !isset($state['players']) || !is_array($state['players']) || count($state['players']) !== 2) {
        fail(400, 'Valid two-player match state is required');
    }
    if (!is_array($state['players'][0] ?? null) || !is_array($state['players'][1] ?? null)) {
        fail(400, 'Invalid player state');
    }
    if (!isset($state['current']) || !in_array((int) $state['current'], [0, 1], true)) {
        fail(400, 'Invalid current player');
    }
    return $state;
}

function makeToken(): string {
    return rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
}

function makeCode(): string {
    $bytes = random_bytes(6);
    $code = '';
    $length = strlen(CODE_ALPHABET);
    for ($i = 0; $i < 6; $i++) $code .= CODE_ALPHABET[ord($bytes[$i]) % $length];
    return $code;
}

function matchPath(string $dataDir, string $code): string {
    return $dataDir . DIRECTORY_SEPARATOR . $code . '.json';
}

function readMatch(string $dataDir, string $code): array {
    $path = matchPath($dataDir, $code);
    $handle = @fopen($path, 'r');
    if ($handle === false) fail(404, 'Battle not found');
    flock($handle, LOCK_SH);
    $raw = stream_get_contents($handle);
    flock($handle, LOCK_UN);
    fclose($handle);
    $match = json_decode((string) $raw, true);
    if (!is_array($match)) fail(500, 'Stored match is invalid');
    return $match;
}

function updateMatch(string $dataDir, string $code, callable $operation): array {
    $path = matchPath($dataDir, $code);
    $handle = @fopen($path, 'r+');
    if ($handle === false) fail(404, 'Battle not found');
    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        fail(503, 'Battle is temporarily unavailable');
    }
    try {
        $raw = stream_get_contents($handle);
        if ($raw === '') fail(500, 'Stored match is invalid');
        $match = json_decode($raw, true);
        if (!is_array($match)) fail(500, 'Stored match is invalid');
        $result = $operation($match);
        rewind($handle);
        ftruncate($handle, 0);
        if (fwrite($handle, encode($match)) === false || !fflush($handle)) {
            fail(500, 'Could not save battle');
        }
        return $result;
    } finally {
        flock($handle, LOCK_UN);
        fclose($handle);
    }
}

function authenticatedPlayer(array $match): int {
    $token = (string) ($_SERVER['HTTP_X_PLAYER_TOKEN'] ?? '');
    if ($token === '') return -1;
    $hash = hash('sha256', $token);
    foreach ($match['tokenHashes'] as $index => $stored) {
        if (is_string($stored) && hash_equals($stored, $hash)) return (int) $index;
    }
    return -1;
}

function publicMatch(array $match): array {
    return [
        'code' => $match['code'],
        'status' => $match['status'],
        'hostName' => $match['hostName'],
        'minWordLength' => $match['minWordLength'],
        'revision' => $match['revision']
    ];
}

function cleanupOldMatches(string $dataDir): void {
    $cutoff = time() - MATCH_TTL_SECONDS;
    foreach (glob($dataDir . DIRECTORY_SEPARATOR . '*.json') ?: [] as $path) {
        if (@filemtime($path) < $cutoff) @unlink($path);
    }
}
