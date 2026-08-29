<?php
declare(strict_types=1);

const STORE_VERSION = 2;
const MAX_BODY_BYTES = 131072;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$allowedOrigins = array(
    'https://www.sarcastichedgehog.com',
    'https://sarcastichedgehog.com'
);
$isLocalOrigin = preg_match('#^http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$#', $origin) === 1;
if (in_array($origin, $allowedOrigins, true) || $isLocalOrigin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Headers: Content-Type, X-Player-ID, X-Player-Token');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Max-Age: 600');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail_request(string $code, string $message, int $status = 400): void
{
    respond(array('ok' => false, 'error' => $code, 'message' => $message), $status);
}

function clean_name($value, int $maximum): string
{
    $name = trim((string)$value);
    $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name);
    if (function_exists('mb_substr')) {
        return mb_substr($name, 0, $maximum, 'UTF-8');
    }
    return substr($name, 0, $maximum);
}

function request_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        fail_request('invalid_body', 'The request was too large or unreadable.', 413);
    }
    if ($raw === '') {
        return array();
    }
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        fail_request('invalid_json', 'The request body was not valid JSON.');
    }
    return $body;
}

function with_store(bool $mutating, callable $operation)
{
    $directory = __DIR__ . DIRECTORY_SEPARATOR . 'data';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        fail_request('storage_unavailable', 'The score service cannot create its private data directory.', 503);
    }
    $path = $directory . DIRECTORY_SEPARATOR . 'store.json';
    $handle = fopen($path, 'c+');
    if ($handle === false) {
        fail_request('storage_unavailable', 'The score service cannot open its data store.', 503);
    }
    $lock = $mutating ? LOCK_EX : LOCK_SH;
    if (!flock($handle, $lock)) {
        fclose($handle);
        fail_request('storage_busy', 'The score service is busy. Please try again.', 503);
    }
    rewind($handle);
    $raw = stream_get_contents($handle);
    $store = $raw ? json_decode($raw, true) : null;
    if (!is_array($store)) {
        $store = array('version' => STORE_VERSION, 'players' => array(), 'groups' => array());
    }
    if (!isset($store['players']) || !is_array($store['players'])) {
        $store['players'] = array();
    }
    if (!isset($store['groups']) || !is_array($store['groups'])) {
        $store['groups'] = array();
    }
    $store['version'] = STORE_VERSION;

    $result = $operation($store);
    if ($mutating) {
        $encoded = json_encode($store, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($encoded === false) {
            flock($handle, LOCK_UN);
            fclose($handle);
            fail_request('storage_error', 'The score service could not encode its data.', 500);
        }
        rewind($handle);
        ftruncate($handle, 0);
        if (fwrite($handle, $encoded) === false) {
            flock($handle, LOCK_UN);
            fclose($handle);
            fail_request('storage_error', 'The score service could not save its data.', 500);
        }
        fflush($handle);
    }
    flock($handle, LOCK_UN);
    fclose($handle);
    return $result;
}

function credentials(): array
{
    $id = isset($_SERVER['HTTP_X_PLAYER_ID']) ? trim($_SERVER['HTTP_X_PLAYER_ID']) : '';
    $token = isset($_SERVER['HTTP_X_PLAYER_TOKEN']) ? trim($_SERVER['HTTP_X_PLAYER_TOKEN']) : '';
    if (!preg_match('/^[A-Za-z0-9-]{8,64}$/', $id) || strlen($token) < 20 || strlen($token) > 160) {
        fail_request('identity_required', 'A valid device identity is required.', 401);
    }
    return array($id, $token);
}

function ensure_player(array &$store, string $id, string $token, string $name): array
{
    $hash = hash('sha256', $token);
    if (isset($store['players'][$id])) {
        if (!hash_equals((string)$store['players'][$id]['token_hash'], $hash)) {
            fail_request('identity_rejected', 'This device identity could not be verified.', 401);
        }
        if ($name !== '') {
            $store['players'][$id]['name'] = $name;
        }
        $store['players'][$id]['seen_at'] = gmdate('c');
        return $store['players'][$id];
    }
    if ($name === '') {
        $name = 'Trail Player';
    }
    $store['players'][$id] = array(
        'id' => $id,
        'name' => $name,
        'token_hash' => $hash,
        'group_id' => null,
        'previous_group_code' => null,
        'role' => null,
        'scores' => array(),
        'group_numbers' => array(),
        'created_at' => gmdate('c'),
        'seen_at' => gmdate('c')
    );
    return $store['players'][$id];
}

function valid_score($value): ?float
{
    if (!is_numeric($value)) {
        return null;
    }
    $number = (float)$value;
    return is_finite($number) && $number >= 0 && $number <= 86400 ? round($number, 3) : null;
}

function merge_progress(array &$player, $progress): void
{
    if (!is_array($progress)) {
        return;
    }
    foreach ($progress as $levelId => $tracks) {
        if (!preg_match('/^[a-z0-9-]{1,40}$/', (string)$levelId) || !is_array($tracks)) {
            continue;
        }
        foreach (array('hare', 'tortoise') as $track) {
            if (!isset($tracks[$track]) || !is_array($tracks[$track])) {
                continue;
            }
            $incoming = $tracks[$track];
            $key = $levelId . ':' . $track;
            $existing = isset($player['scores'][$key]) && is_array($player['scores'][$key])
                ? $player['scores'][$key]
                : array('level_id' => $levelId, 'track' => $track, 'overall' => null, 'standard' => null, 'golden' => null, 'stars' => 0, 'par_beaten' => false);
            if (!array_key_exists('standard', $existing)) {
                $existing['standard'] = null;
            }
            foreach (array('overall', 'standard', 'golden') as $category) {
                $candidate = valid_score(isset($incoming[$category]) ? $incoming[$category] : null);
                if ($candidate === null) {
                    continue;
                }
                $current = valid_score(isset($existing[$category]) ? $existing[$category] : null);
                if ($current === null || ($track === 'hare' ? $candidate < $current : $candidate > $current)) {
                    $existing[$category] = $candidate;
                }
            }
            $existing['stars'] = max((int)$existing['stars'], min(3, max(0, (int)(isset($incoming['stars']) ? $incoming['stars'] : 0))));
            $existing['par_beaten'] = !empty($existing['par_beaten']) || !empty($incoming['parBeaten']);
            $existing['updated_at'] = gmdate('c');
            $player['scores'][$key] = $existing;
        }
    }
}

function ensure_group_numbers(array &$store, string $groupId): void
{
    if (!isset($store['groups'][$groupId])) {
        return;
    }
    $memberIds = array();
    foreach ($store['players'] as $id => $candidate) {
        if (isset($candidate['group_id']) && $candidate['group_id'] === $groupId) {
            $memberIds[] = $id;
        }
    }
    usort($memberIds, function ($leftId, $rightId) use ($store, $groupId) {
        $left = $store['players'][$leftId];
        $right = $store['players'][$rightId];
        $ownerId = isset($store['groups'][$groupId]['owner_id']) ? $store['groups'][$groupId]['owner_id'] : '';
        if ($leftId === $ownerId && $rightId !== $ownerId) return -1;
        if ($rightId === $ownerId && $leftId !== $ownerId) return 1;
        $leftJoined = isset($left['joined_at']) ? (string)$left['joined_at'] : (isset($left['created_at']) ? (string)$left['created_at'] : '');
        $rightJoined = isset($right['joined_at']) ? (string)$right['joined_at'] : (isset($right['created_at']) ? (string)$right['created_at'] : '');
        if ($leftJoined === $rightJoined) return strcmp($leftId, $rightId);
        return strcmp($leftJoined, $rightJoined);
    });

    $used = array();
    foreach ($memberIds as $id) {
        $numbers = isset($store['players'][$id]['group_numbers']) && is_array($store['players'][$id]['group_numbers'])
            ? $store['players'][$id]['group_numbers']
            : array();
        $number = isset($numbers[$groupId]) ? (int)$numbers[$groupId] : 0;
        if ($number > 0 && !isset($used[$number])) {
            $used[$number] = true;
        } else {
            $numbers[$groupId] = 0;
        }
        $store['players'][$id]['group_numbers'] = $numbers;
    }

    $next = isset($store['groups'][$groupId]['next_player_number'])
        ? max(1, (int)$store['groups'][$groupId]['next_player_number'])
        : 1;
    if (!empty($used)) $next = max($next, max(array_keys($used)) + 1);
    foreach ($memberIds as $id) {
        if ((int)$store['players'][$id]['group_numbers'][$groupId] > 0) continue;
        while (isset($used[$next])) $next++;
        $store['players'][$id]['group_numbers'][$groupId] = $next;
        $used[$next] = true;
        $next++;
    }
    $store['groups'][$groupId]['next_player_number'] = $next;
}

function group_records(array $members): array
{
    $records = array(
        'standard' => array('hare' => array(), 'tortoise' => array()),
        'golden' => array('hare' => array(), 'tortoise' => array())
    );
    foreach (array('standard', 'golden') as $category) {
        foreach (array('hare', 'tortoise') as $track) {
            $winners = array();
            foreach ($members as $member) {
                foreach ($member['scores'] as $score) {
                    if (!is_array($score) || $score['track'] !== $track) continue;
                    $time = valid_score(isset($score[$category]) ? $score[$category] : null);
                    if ($time === null) continue;
                    $levelId = (string)$score['level_id'];
                    $candidate = array(
                        'levelId' => $levelId,
                        'playerId' => $member['id'],
                        'playerNumber' => (int)$member['player_number'],
                        'name' => $member['name'],
                        'time' => $time
                    );
                    if (!isset($winners[$levelId])) {
                        $winners[$levelId] = $candidate;
                        continue;
                    }
                    $current = $winners[$levelId];
                    $better = $track === 'hare' ? $time < $current['time'] : $time > $current['time'];
                    $tiedEarlierMember = $time === $current['time'] && $candidate['playerNumber'] < $current['playerNumber'];
                    if ($better || $tiedEarlierMember) $winners[$levelId] = $candidate;
                }
            }
            $records[$category][$track] = array_values($winners);
        }
    }
    return $records;
}

function group_payload(array &$store, array $player): array
{
    $membership = null;
    $emptyRecords = array('standard' => array('hare' => array(), 'tortoise' => array()), 'golden' => array('hare' => array(), 'tortoise' => array()));
    $groupId = isset($player['group_id']) ? $player['group_id'] : null;
    if ($groupId === null || !isset($store['groups'][$groupId])) {
        return array('membership' => null, 'members' => array(), 'records' => $emptyRecords);
    }
    ensure_group_numbers($store, $groupId);
    $player = $store['players'][$player['id']];
    $group = $store['groups'][$groupId];
    $members = array();
    foreach ($store['players'] as $candidate) {
        if (isset($candidate['group_id']) && $candidate['group_id'] === $groupId) {
            $candidate['player_number'] = (int)$candidate['group_numbers'][$groupId];
            $members[] = $candidate;
        }
    }
    usort($members, function ($left, $right) { return $left['player_number'] <=> $right['player_number']; });
    $publicMembers = array_map(function ($member) {
        return array('playerId' => $member['id'], 'name' => $member['name'], 'number' => $member['player_number']);
    }, $members);
    $membership = array(
        'id' => $groupId,
        'name' => $group['name'],
        'code' => $group['code'],
        'role' => isset($player['role']) ? $player['role'] : 'member',
        'memberCount' => count($members),
        'playerNumber' => (int)$player['group_numbers'][$groupId],
        'joinedAt' => isset($player['joined_at']) ? $player['joined_at'] : null
    );
    return array('membership' => $membership, 'members' => $publicMembers, 'records' => group_records($members));
}

function unique_group_code(array $groups): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    do {
        $suffix = '';
        for ($index = 0; $index < 6; $index++) {
            $suffix .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        $code = 'HEDGE-' . $suffix;
        $exists = false;
        foreach ($groups as $group) {
            if (isset($group['code']) && $group['code'] === $code) {
                $exists = true;
                break;
            }
        }
    } while ($exists);
    return $code;
}

$action = isset($_GET['action']) ? strtolower((string)$_GET['action']) : 'health';
if ($action === 'health') {
    respond(array('ok' => true, 'service' => 'hare-and-tortoise-scores', 'version' => STORE_VERSION));
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail_request('method_not_allowed', 'Use POST for this action.', 405);
}

list($playerId, $playerToken) = credentials();
$body = request_body();
$playerName = clean_name(isset($body['name']) ? $body['name'] : '', 24);

$result = with_store(true, function (&$store) use ($action, $body, $playerId, $playerToken, $playerName) {
    $player = ensure_player($store, $playerId, $playerToken, $playerName);

    if ($action === 'sync') {
        merge_progress($player, isset($body['progress']) ? $body['progress'] : array());
        $store['players'][$playerId] = $player;
    } elseif ($action === 'create-group') {
        if (!empty($player['group_id'])) {
            fail_request('already_in_group', 'Leave your current group before creating another.', 409);
        }
        $name = clean_name(isset($body['groupName']) ? $body['groupName'] : '', 32);
        if ($name === '') {
            fail_request('group_name_required', 'Choose a name for the group.');
        }
        $code = unique_group_code($store['groups']);
        $groupId = bin2hex(random_bytes(12));
        $store['groups'][$groupId] = array('id' => $groupId, 'name' => $name, 'code' => $code, 'owner_id' => $playerId, 'next_player_number' => 2, 'created_at' => gmdate('c'));
        $player['group_id'] = $groupId;
        $player['role'] = 'owner';
        $player['joined_at'] = gmdate('c');
        $player['previous_group_code'] = null;
        if (!isset($player['group_numbers']) || !is_array($player['group_numbers'])) $player['group_numbers'] = array();
        $player['group_numbers'][$groupId] = 1;
        $store['players'][$playerId] = $player;
    } elseif ($action === 'join-group') {
        if (!empty($player['group_id'])) {
            fail_request('already_in_group', 'Leave your current group before joining another.', 409);
        }
        $code = strtoupper(trim((string)(isset($body['inviteCode']) ? $body['inviteCode'] : '')));
        $groupId = null;
        foreach ($store['groups'] as $candidateId => $group) {
            if (isset($group['code']) && hash_equals($group['code'], $code)) {
                $groupId = $candidateId;
                break;
            }
        }
        if ($groupId === null) {
            fail_request('group_not_found', 'That invitation code does not match a group.', 404);
        }
        $player['group_id'] = $groupId;
        $player['role'] = $store['groups'][$groupId]['owner_id'] === $playerId ? 'owner' : 'member';
        $player['joined_at'] = gmdate('c');
        $player['previous_group_code'] = null;
        $store['players'][$playerId] = $player;
    } elseif ($action === 'leave-group') {
        $groupId = isset($player['group_id']) ? $player['group_id'] : null;
        if ($groupId === null || !isset($store['groups'][$groupId])) {
            fail_request('not_in_group', 'You are not currently in a group.', 409);
        }
        $memberCount = 0;
        foreach ($store['players'] as $candidate) {
            if (isset($candidate['group_id']) && $candidate['group_id'] === $groupId) {
                $memberCount++;
            }
        }
        if ($player['role'] === 'owner' && $memberCount > 1) {
            fail_request('owner_transfer_required', 'Choose another owner before leaving this group.', 409);
        }
        $player['previous_group_code'] = $store['groups'][$groupId]['code'];
        $player['group_id'] = null;
        $player['role'] = null;
        $player['joined_at'] = null;
        $store['players'][$playerId] = $player;
    } else {
        fail_request('unknown_action', 'That service action is not available.', 404);
    }

    $player = $store['players'][$playerId];
    $groupData = group_payload($store, $player);
    return array(
        'ok' => true,
        'player' => array('id' => $player['id'], 'name' => $player['name']),
        'membership' => $groupData['membership'],
        'previousGroupCode' => isset($player['previous_group_code']) ? $player['previous_group_code'] : null,
        'members' => $groupData['members'],
        'records' => $groupData['records']
    );
});

respond($result);

