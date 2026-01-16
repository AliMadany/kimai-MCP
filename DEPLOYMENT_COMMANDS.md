# Quick Deployment Commands for kimaimcp.urkitchenegypt.com

**Project Path:** `/home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp`
**Domain:** `https://kimaimcp.urkitchenegypt.com`

---

## Copy and paste these commands one by one:

### 1. Navigate to Project and Verify Node.js

```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
node --version
npm --version
```

### 2. Check if pnpm is Already Installed, Then Install if Needed

```bash
# First, check if pnpm is already installed
which pnpm
pnpm --version

# Check common locations (Alt-NodeJS might have it)
ls -la /opt/alt/alt-nodejs20/root/usr/bin/pnpm 2>/dev/null
ls -la /opt/alt/alt-nodejs22/root/usr/bin/pnpm 2>/dev/null
ls -la /opt/alt/alt-nodejs24/root/usr/bin/pnpm 2>/dev/null

# Search for pnpm
find /opt/alt/alt-nodejs* -name pnpm 2>/dev/null
```

**If pnpm is NOT found, install it:**

```bash
npm install -g pnpm
pnpm --version
```

**If npm install -g doesn't work (permissions), use npx:**

```bash
# Use npx (no installation needed)
npx pnpm install
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Build the Project

```bash
pnpm build
ls -la packages/server/dist/
```

### 5. Create .env File and Generate Encryption Key

```bash
cd packages/server

# Generate encryption key
openssl rand -hex 32

# Copy the output (64 characters), then create .env file
nano .env
```

**Paste this in nano (replace ENCRYPTION_KEY with the value you just generated):**

```bash
MCP_MODE=http
HTTP_PORT=3002
HTTP_HOST=0.0.0.0
HTTP_BASE_URL=https://kimaimcp.urkitchenegypt.com
ENCRYPTION_KEY=paste_your_generated_key_here
LOG_LEVEL=info
LOG_REQUESTS=true
```

**Save:** `Ctrl+X`, then `Y`, then `Enter`

### 6. Verify .env File

```bash
cat .env
```

### 7. Test Start the Server (to verify it works)

```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
npm start
```

**Press `Ctrl+C` to stop after testing**

### 8. Set Up Hostinger Node.js App Manager (Recommended for Shared Hosting)

1. **Log into hPanel** (Hostinger control panel)
2. Go to **"Node.js Apps"** or **"Application Manager"**
3. Click **"Create Application"** or **"Add Node.js App"**
4. Fill in:
   - **Application Name**: `urtime-mcp`
   - **Application Root**: `/home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server`
   - **Application URL**: `kimaimcp.urkitchenegypt.com` (or select from dropdown)
   - **Node.js Version**: `20.x` (or `alt-nodejs20`)
   - **Start Command**: `npm start`
   - **Port**: `3002` (or leave auto)
   - **SSL**: Enable Let's Encrypt
5. Click **"Create"** or **"Save"**
6. Click **"Start"** button

### 9. Alternative: Use PM2 (if supported)

```bash
npm install -g pm2
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
pm2 start npm --name "urtime-mcp" -- start
pm2 status
pm2 logs urtime-mcp
```

### 10. Verify It's Working

```bash
# Test health endpoint
curl https://kimaimcp.urkitchenegypt.com/health
```

**Expected response:**
```json
{"status":"ok","server":"urtime-kimai","version":"1.0.0","mode":"http"}
```

---

## All-in-One Script (Copy All At Once)

```bash
# Navigate and set up Node.js
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

# Install pnpm
npm install -g pnpm

# Install dependencies and build
pnpm install
pnpm build

# Navigate to server directory
cd packages/server

# Generate encryption key and show it
echo "=== GENERATE ENCRYPTION KEY ==="
ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "Your encryption key is: $ENCRYPTION_KEY"
echo "Copy this key and use it in the .env file"

# Create .env file (you'll need to edit ENCRYPTION_KEY)
cat > .env << EOF
MCP_MODE=http
HTTP_PORT=3002
HTTP_HOST=0.0.0.0
HTTP_BASE_URL=https://kimaimcp.urkitchenegypt.com
ENCRYPTION_KEY=${ENCRYPTION_KEY}
LOG_LEVEL=info
LOG_REQUESTS=true
EOF

# Show .env file
echo "=== .env file created ==="
cat .env

echo ""
echo "=== DEPLOYMENT READY ==="
echo "Now set up in Hostinger Node.js App Manager:"
echo "- App Root: /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server"
echo "- Start Command: npm start"
echo "- URL: kimaimcp.urkitchenegypt.com"
```

---

## Troubleshooting

### If npm start fails:
```bash
# Check .env file exists
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
cat .env

# Check if built files exist
ls -la dist/

# Try running directly
node dist/server.js
```

### If port 3002 is in use:
```bash
# Change HTTP_PORT in .env to another port (e.g., 3003)
# Then update Hostinger App Manager port setting
```

---

## Quick Test Commands

```bash
# Check if server is responding
curl http://localhost:3002/health

# Check Node.js version
node --version

# Check if pnpm is installed
pnpm --version

# View server logs (if using PM2)
pm2 logs urtime-mcp

# Check process (if using PM2)
pm2 status
```

---

**After completing these steps, your server should be running at: `https://kimaimcp.urkitchenegypt.com`** 🎉

