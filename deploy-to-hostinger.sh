#!/bin/bash
# deploy-to-hostinger.sh
# Packages locally built files for deployment to Hostinger

set -e

echo "📦 Packaging deployment files..."

# Create deployment directory
DEPLOY_DIR="deploy-hostinger"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# Copy built files and dependencies
echo "Copying server package..."
cp -r packages/server/dist "$DEPLOY_DIR/server-dist"
cp -r packages/server/node_modules "$DEPLOY_DIR/server-node_modules"
cp packages/server/package.json "$DEPLOY_DIR/server-package.json"

echo "Copying shared package..."
cp -r packages/shared/dist "$DEPLOY_DIR/shared-dist"
cp -r packages/shared/node_modules "$DEPLOY_DIR/shared-node_modules"
cp packages/shared/package.json "$DEPLOY_DIR/shared-package.json"

# Copy root files
cp package.json "$DEPLOY_DIR/"

# Create .env template if it doesn't exist on server
if [ ! -f "$DEPLOY_DIR/.env.example" ]; then
  cat > "$DEPLOY_DIR/.env.template" << 'EOF'
# Copy this to packages/server/.env and fill in values
MCP_MODE=http
HTTP_PORT=3002
HTTP_HOST=0.0.0.0
HTTP_BASE_URL=https://kimaimcp.urkitchenegypt.com
ENCRYPTION_KEY=generate_with_openssl_rand_hex_32
LOG_LEVEL=info
LOG_REQUESTS=true
EOF
fi

# Create deployment instructions
cat > "$DEPLOY_DIR/DEPLOY_INSTRUCTIONS.txt" << 'EOF'
DEPLOYMENT INSTRUCTIONS FOR HOSTINGER
=====================================

1. Upload deploy-hostinger.tar.gz to your server
   (via FTP/SFTP to: /home/u838631855/domains/kimaimcp.urkitchenegypt.com/)

2. Extract on server:
   cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp
   tar -xzf ../deploy-hostinger.tar.gz --strip-components=1 deploy-hostinger/*

3. Organize files:
   mv server-dist packages/server/dist
   mv server-node_modules packages/server/node_modules
   mv server-package.json packages/server/package.json
   
   mv shared-dist packages/shared/dist
   mv shared-node_modules packages/shared/node_modules
   mv shared-package.json packages/shared/package.json

4. Create .env file (if not exists):
   cd packages/server
   nano .env
   # Copy from .env.template and set values

5. Test run:
   export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
   npm start

6. Set up in Hostinger Node.js App Manager:
   - App Root: /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
   - Start Command: npm start
   - Port: 3002
   - Node Version: 20.x
EOF

# Create tar.gz package
echo "Creating deployment package..."
cd "$DEPLOY_DIR"
tar -czf ../deploy-hostinger.tar.gz *
cd ..

echo ""
echo "✅ Deployment package created: deploy-hostinger.tar.gz"
echo "📋 File size: $(ls -lh deploy-hostinger.tar.gz | awk '{print $5}')"
echo ""
echo "Next steps:"
echo "1. Upload deploy-hostinger.tar.gz to your server"
echo "2. Follow instructions in deploy-hostinger/DEPLOY_INSTRUCTIONS.txt"
echo ""

# Cleanup
rm -rf "$DEPLOY_DIR"

