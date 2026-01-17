<?php
/**
 * PHP Proxy for Node.js MCP Server
 * Place this file in public_html/
 * 
 * This proxy forwards requests from public_html to your Node.js server
 */

$nodejs_port = 3002;
$nodejs_host = '127.0.0.1';

// Get the original request
$method = $_SERVER['REQUEST_METHOD'];
$url = $_SERVER['REQUEST_URI'];
$query_string = $_SERVER['QUERY_STRING'] ?? '';

// Build full URL for Node.js server
$full_url = "http://{$nodejs_host}:{$nodejs_port}{$url}";
if ($query_string) {
    $full_url .= "?{$query_string}";
}

// Prepare headers
$headers = [];
foreach (getallheaders() as $key => $value) {
    // Skip certain headers that shouldn't be forwarded
    $skip_headers = ['host', 'connection', 'content-length'];
    if (!in_array(strtolower($key), $skip_headers)) {
        $headers[] = "{$key}: {$value}";
    }
}

// Initialize cURL
$ch = curl_init($full_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_HEADER, true);
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

// Set headers
if (!empty($headers)) {
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
}

// Handle POST/PUT/PATCH data
if (in_array($method, ['POST', 'PUT', 'PATCH'])) {
    $post_data = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $post_data);
    if (!isset($_SERVER['CONTENT_TYPE'])) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, array_merge($headers, ['Content-Type: application/json']));
    }
}

// Execute request
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$header_size = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

// Split headers and body
$response_headers = substr($response, 0, $header_size);
$response_body = substr($response, $header_size);

// Forward response headers (except some)
$header_lines = explode("\r\n", $response_headers);
foreach ($header_lines as $header_line) {
    if (empty($header_line) || strpos($header_line, 'HTTP/') === 0) {
        continue;
    }
    $skip_response_headers = ['transfer-encoding', 'connection', 'content-encoding'];
    $header_parts = explode(':', $header_line, 2);
    if (count($header_parts) === 2 && !in_array(strtolower(trim($header_parts[0])), $skip_response_headers)) {
        header(trim($header_line), false);
    }
}

// Set HTTP status code
http_response_code($http_code);

// Output body
echo $response_body;

