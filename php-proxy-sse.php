<?php
/**
 * PHP Proxy for MCP Server with SSE Support
 * This proxy forwards requests to Node.js and handles SSE streaming
 */

// CORS headers - must be set before any output
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id");
header("Access-Control-Expose-Headers: Mcp-Session-Id, WWW-Authenticate");

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$nodeUrl = 'http://127.0.0.1:3002' . $_SERVER['REQUEST_URI'];

// Collect request headers to forward
$forwardHeaders = [];
foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    // Forward relevant headers
    if (in_array($lower, ['authorization', 'content-type', 'mcp-session-id', 'accept'])) {
        $forwardHeaders[] = "$name: $value";
    }
}

// Check if this is likely an SSE request (GET to / or /mcp with Accept: text/event-stream)
$acceptHeader = isset($_SERVER['HTTP_ACCEPT']) ? $_SERVER['HTTP_ACCEPT'] : '';
$isSSE = ($_SERVER['REQUEST_METHOD'] === 'GET' &&
          strpos($acceptHeader, 'text/event-stream') !== false);

if ($isSSE) {
    // SSE Streaming mode
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');

    // Disable output buffering
    while (ob_get_level()) ob_end_clean();

    // Set up streaming curl
    $ch = curl_init($nodeUrl);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
    curl_setopt($ch, CURLOPT_HEADER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 0); // No timeout for SSE
    curl_setopt($ch, CURLOPT_BUFFERSIZE, 128);
    curl_setopt($ch, CURLOPT_TCP_NODELAY, true);

    // Stream response directly to output
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $data) {
        echo $data;
        flush();
        return strlen($data);
    });

    // Forward response headers
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $header) {
        $len = strlen($header);
        $parts = explode(':', $header, 2);
        if (count($parts) == 2) {
            $name = trim($parts[0]);
            $value = trim($parts[1]);
            $lower = strtolower($name);
            // Forward important headers
            if (in_array($lower, ['mcp-session-id', 'www-authenticate'])) {
                header("$name: $value");
            }
        }
        return $len;
    });

    curl_exec($ch);
    curl_close($ch);

} else {
    // Regular request mode (POST or non-SSE GET)
    $ch = curl_init($nodeUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('php://input'));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);

    // Parse response headers
    $responseHeaders = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);

    // Forward important headers
    foreach (explode("\r\n", $responseHeaders) as $line) {
        if (empty($line)) continue;
        $parts = explode(':', $line, 2);
        if (count($parts) == 2) {
            $name = trim($parts[0]);
            $value = trim($parts[1]);
            $lower = strtolower($name);
            if (in_array($lower, ['content-type', 'mcp-session-id', 'www-authenticate'])) {
                header("$name: $value");
            }
        }
    }

    http_response_code($httpCode);
    echo $body;
}
?>
