#!/bin/bash
# extract-on-server.sh
# Run this on Hostinger server after uploading deploy-hostinger.tar.gz

set -e

cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com

# Extract the deployment package
echo "📦 Extracting deployment package..."
tar -xzf deploy-hostinger.tar.gz -C urtime-mcp/ --strip-components=1 deploy-hostinger/*

cd urtime-mcp

# Organize server files
echo "📁 Organizing server files..."
mv server-dist packages/server/dist
mv server-node_modules packages/server/node_modules  
mv server-package.json packages/server/package.json

# Organize shared files
echo "📁 Organizing shared files..."
mv shared-dist packages/shared/dist
mv shared-node_modules packages/shared/node_modules
mv shared-package.json packages/shared/package.json

# Verify better-sqlite3 binary
echo "🔍 Verifying better-sqlite3 binary..."
if [ -f "packages/server/node_modules/better-sqlite3/lib/binding/node-v115-linux-x64/better_sqlite3.node" ]; then
  echo "✅ better-sqlite3 binary found!"
elif [ -f "packages/server/node_modules/better-sqlite3/build/Release/better_sqlite3.node" ]; then
  echo "✅ better-sqlite3 binary found in build/Release!"
else
  echo "⚠️  Warning: better-sqlite3 binary not found. Searching..."
  find packages/server/node_modules/better-sqlite3 -name "*.node" 2>/dev/null | head -3
fi

# Verify build files
echo "🔍 Verifying build files..."
ls -la packages/server/dist/server.js
ls -la packages/shared/dist/index.js

echo ""
echo "✅ Files extracted and organized!"
echo ""
echo "Next steps:"
echo "1. cd packages/server"
echo "2. Create .env file: nano .env"
echo "3. Test: export PATH=\"/opt/alt/alt-nodejs20/root/usr/bin:\$PATH\" && npm start"
echo "4. Set up in Hostinger Node.js App Manager (hPanel)"
echo ""

