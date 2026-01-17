#!/bin/bash
# start-node-server.sh
# Start Node.js server as background process
# Run this on Hostinger server

cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server

# Set Node.js in PATH
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

# Create data directory if needed
mkdir -p data

# Start server in background
nohup npm start > server.log 2>&1 &

# Get PID
echo $! > server.pid

echo "✅ Node.js server started!"
echo "PID: $(cat server.pid)"
echo "Logs: tail -f server.log"
echo "Stop: kill \$(cat server.pid)"

