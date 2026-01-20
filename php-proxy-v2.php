<?php
/**
 * PHP Proxy for MCP Server with SSE Support v2
 * Fixed: Headers sent before streaming
 */

// CORS headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, Mcp-Session-Id");
header("Access-Control-Expose-Headers: Mcp-Session-Id, WWW-Authenticate");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$nodeUrl = 'http://127.0.0.1:3002' . $_SERVER['REQUEST_URI'];

// Collect request headers to forward
$forwardHeaders = [];
foreach (getallheaders() as $name => $value) {
    $lower = strtolower($name);
    if (in_array($lower, ['authorization', 'content-type', 'mcp-session-id', 'accept'])) {
        $forwardHeaders[] = "$name: $value";
    }
}

// Check if this is an SSE request
$acceptHeader = isset($_SERVER['HTTP_ACCEPT']) ? $_SERVER['HTTP_ACCEPT'] : '';
$isSSE = ($_SERVER['REQUEST_METHOD'] === 'GET' &&
          (strpos($acceptHeader, 'text/event-stream') !== false ||
           $_SERVER['REQUEST_URI'] === '/' ||
           $_SERVER['REQUEST_URI'] === '/mcp'));

if ($isSSE && $_SERVER['REQUEST_METHOD'] === 'GET') {
    // First, make a HEAD-like request to get headers
    $headerCh = curl_init($nodeUrl);
    curl_setopt($headerCh, CURLOPT_HTTPHEADER, array_merge($forwardHeaders, ['Accept: text/event-stream']));
    curl_setopt($headerCh, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($headerCh, CURLOPT_HEADER, true);
    curl_setopt($headerCh, CURLOPT_NOBODY, false);
    curl_setopt($headerCh, CURLOPT_TIMEOUT, 2);

    $headerResponse = curl_exec($headerCh);
    $headerSize = curl_getinfo($headerCh, CURLINFO_HEADER_SIZE);
    curl_close($headerCh);

    // Parse and forward important headers
    if ($headerResponse) {
        $responseHeaders = substr($headerResponse, 0, $headerSize);
        foreach (explode("\r\n", $responseHeaders) as $line) {
            if (empty($line)) continue;
            $parts = explode(':', $line, 2);
            if (count($parts) == 2) {
                $name = trim($parts[0]);
                $value = trim($parts[1]);
                $lower = strtolower($name);
                if ($lower === 'mcp-session-id') {
                    header("Mcp-Session-Id: $value");
                }
            }
        }
    }

    // Now set SSE headers and stream
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');

    // Disable ALL output buffering
    while (ob_get_level()) ob_end_flush();
    if (function_exists('apache_setenv')) {
        apache_setenv('no-gzip', '1');
    }
    ini_set('zlib.output_compression', 'Off');
    ini_set('output_buffering', 'Off');
    ini_set('implicit_flush', 1);
    ob_implicit_flush(1);

    // Set up streaming curl
    $ch = curl_init($nodeUrl);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($forwardHeaders, ['Accept: text/event-stream']));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
    curl_setopt($ch, CURLOPT_HEADER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, 0);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_BUFFERSIZE, 64);
    curl_setopt($ch, CURLOPT_TCP_NODELAY, true);
    curl_setopt($ch, CURLOPT_FORBID_REUSE, true);
    curl_setopt($ch, CURLOPT_FRESH_CONNECT, true);

    // Stream response directly to output
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $data) {
        echo $data;
        flush();
        if (connection_aborted()) {
            return 0; // Stop curl
        }
        return strlen($data);
    });

    // Ignore errors on execute - connection will close when client disconnects
    @curl_exec($ch);
    curl_close($ch);

} else {
    // Regular request mode (POST or non-SSE GET)
    $ch = curl_init($nodeUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $forwardHeaders);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $_SERVER['REQUEST_METHOD']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $postData = file_get_contents('php://input');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    }

    $response = curl_exec($ch);

    if ($response === false) {
        http_response_code(502);
        echo json_encode(['error' => 'Backend unavailable: ' . curl_error($ch)]);
        curl_close($ch);
        exit;
    }

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
