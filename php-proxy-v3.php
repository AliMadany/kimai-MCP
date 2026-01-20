<?php
/**
 * PHP Proxy for MCP Server v3
 * Uses fsockopen for better SSE streaming
 */

set_time_limit(0);
ignore_user_abort(false);

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id");
header("Access-Control-Expose-Headers: Mcp-Session-Id, WWW-Authenticate");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$nodeHost = '127.0.0.1';
$nodePort = 3002;
$uri = $_SERVER['REQUEST_URI'];

// Build request headers
$headers = [];
$headers[] = $_SERVER['REQUEST_METHOD'] . ' ' . $uri . ' HTTP/1.1';
$headers[] = 'Host: ' . $nodeHost . ':' . $nodePort;
$headers[] = 'Connection: keep-alive';

foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    if (in_array($lower, ['authorization', 'content-type', 'mcp-session-id', 'accept'])) {
        $headers[] = $name . ': ' . $value;
    }
}

// For GET requests to MCP endpoint, add SSE accept header
if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($uri === '/' || $uri === '/mcp')) {
    $hasAccept = false;
    foreach ($headers as $h) {
        if (stripos($h, 'Accept:') === 0) $hasAccept = true;
    }
    if (!$hasAccept) {
        $headers[] = 'Accept: text/event-stream';
    }
}

$body = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = file_get_contents('php://input');
    $headers[] = 'Content-Length: ' . strlen($body);
}

$headers[] = ''; // Empty line to end headers
$headers[] = '';

$request = implode("\r\n", $headers) . $body;

// Connect to Node.js
$sock = @fsockopen($nodeHost, $nodePort, $errno, $errstr, 10);
if (!$sock) {
    http_response_code(502);
    echo json_encode(['error' => "Cannot connect to backend: $errstr ($errno)"]);
    exit;
}

// Send request
fwrite($sock, $request);

// Read response headers
$responseHeaders = '';
while (!feof($sock)) {
    $line = fgets($sock, 4096);
    if ($line === "\r\n" || $line === "\n") {
        break;
    }
    $responseHeaders .= $line;
}

// Parse status line
$statusLine = strtok($responseHeaders, "\r\n");
preg_match('/HTTP\/\d\.\d (\d+)/', $statusLine, $matches);
$httpCode = isset($matches[1]) ? (int)$matches[1] : 200;
http_response_code($httpCode);

// Parse and forward headers
$isSSE = false;
$headerLines = explode("\r\n", $responseHeaders);
foreach ($headerLines as $line) {
    if (empty($line) || strpos($line, 'HTTP/') === 0) continue;
    $parts = explode(':', $line, 2);
    if (count($parts) == 2) {
        $name = trim($parts[0]);
        $value = trim($parts[1]);
        $lower = strtolower($name);

        if ($lower === 'content-type') {
            header("Content-Type: $value");
            if (strpos($value, 'text/event-stream') !== false) {
                $isSSE = true;
            }
        } elseif (in_array($lower, ['mcp-session-id', 'www-authenticate', 'cache-control'])) {
            header("$name: $value");
        }
    }
}

if ($isSSE) {
    // SSE mode - stream indefinitely
    header('X-Accel-Buffering: no');

    while (ob_get_level()) ob_end_flush();
    ob_implicit_flush(1);

    stream_set_blocking($sock, false);
    stream_set_timeout($sock, 0);

    while (!feof($sock) && !connection_aborted()) {
        $data = fread($sock, 1024);
        if ($data !== false && $data !== '') {
            echo $data;
            flush();
        } else {
            // Small delay to prevent CPU spin
            usleep(10000); // 10ms
        }
    }
} else {
    // Regular mode - read entire response
    $responseBody = '';
    while (!feof($sock)) {
        $responseBody .= fread($sock, 8192);
    }
    echo $responseBody;
}

fclose($sock);
?>
