# Deploy to Hostinger - Step by Step

## Files Created

- `deploy-hostinger.tar.gz` - Your deployment package (upload this)
- `extract-on-server.sh` - Script to extract on server (upload this too, or run commands manually)

## Step 1: Upload Files to Server

Upload these files to Hostinger:

```
upload/deploy-hostinger.tar.gz → /home/u838631855/domains/kimaimcp.urkitchenegypt.com/
```

You can use:
- **FTP/SFTP client** (FileZilla, WinSCP, etc.)
- **SCP** from terminal:
  ```bash
  scp deploy-hostinger.tar.gz u838631855@kimaimcp.urkitchenegypt.com:/home/u838631855/domains/kimaimcp.urkitchenegypt.com/
  ```

## Step 2: SSH into Server and Extract

```bash
# SSH into your server
ssh u838631855@kimaimcp.urkitchenegypt.com

# Navigate to domain directory
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com

# Extract the package
tar -xzf deploy-hostinger.tar.gz -C urtime-mcp/ --strip-components=1 deploy-hostinger/*

cd urtime-mcp

# Organize files
mv server-dist packages/server/dist
mv server-node_modules packages/server/node_modules
mv server-package.json packages/server/package.json

mv shared-dist packages/shared/dist
mv shared-node_modules packages/shared/node_modules
mv shared-package.json packages/shared/package.json
```

**OR use the extraction script:**

```bash
# Upload extract-on-server.sh first
scp extract-on-server.sh u838631855@kimaimcp.urkitchenegypt.com:/home/u838631855/domains/kimaimcp.urkitchenegypt.com/

# On server, run:
chmod +x extract-on-server.sh
./extract-on-server.sh
```

## Step 3: Create .env File

```bash
cd packages/server

# Generate encryption key
openssl rand -hex 32

# Create .env file (paste the key you generated)
nano .env
```

**Paste this (replace `YOUR_KEY_HERE` with the key from openssl):**

```bash
MCP_MODE=http
HTTP_PORT=3002
HTTP_HOST=0.0.0.0
HTTP_BASE_URL=https://kimaimcp.urkitchenegypt.com
ENCRYPTION_KEY=YOUR_KEY_HERE
LOG_LEVEL=info
LOG_REQUESTS=true
```

Save: `Ctrl+X`, `Y`, `Enter`

## Step 4: Verify Files

```bash
# Check better-sqlite3 binary exists
find packages/server/node_modules/better-sqlite3 -name "*.node" 2>/dev/null

# Check build files
ls -la packages/server/dist/server.js
ls -la packages/shared/dist/index.js
```

## Step 5: Test Locally on Server

```bash
cd packages/server

# Set Node.js in PATH
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

# Test start
npm start

# Or HTTP mode
npm run start:http
```

Press `Ctrl+C` to stop after testing.

## Step 6: Set Up Hostinger Node.js App Manager

1. **Log into hPanel** (Hostinger control panel)
2. Navigate to **"Node.js Apps"** or **"Application Manager"**
3. Click **"Create Application"** or **"Add Node.js App"**
4. Fill in:
   - **Application Name**: `urtime-mcp`
   - **Application Root**: `/home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server`
   - **Application URL**: `kimaimcp.urkitchenegypt.com` (or select from dropdown)
   - **Node.js Version**: `20.x` or `alt-nodejs20`
   - **Start Command**: `npm start`
   - **Port**: `3002` (or leave auto if available)
   - **Environment Variables**: (optional - already set in .env file)
     - `MCP_MODE=http`
     - `HTTP_PORT=3002`
   - **SSL**: Enable Let's Encrypt SSL
5. Click **"Create"** or **"Save"**
6. Click **"Start"** button

## Step 7: Verify Deployment

```bash
# Test health endpoint
curl https://kimaimcp.urkitchenegypt.com/health
```

**Expected response:**
```json
{"status":"ok","server":"urtime-kimai","version":"1.0.0","mode":"http"}
```

Visit in browser: `https://kimaimcp.urkitchenegypt.com/health`

## Troubleshooting

### If better-sqlite3 binary not found

The binary should be in the uploaded `node_modules`. Check:

```bash
find packages/server/node_modules/better-sqlite3 -name "*.node"
```

If not found, you may need to compile it on the server (see earlier troubleshooting steps).

### If port 3002 is in use

Change `HTTP_PORT` in `.env` to another port (e.g., `3003`) and update Hostinger App Manager.

### If server won't start

Check logs in Hostinger App Manager or run manually:

```bash
cd packages/server
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
npm start
```

## Important Notes

- ✅ **DO NOT put files in `public_html/`** - This is for static/PHP sites only
- ✅ **Install in `urtime-mcp/` directory** - Outside `public_html`
- ✅ **Use Hostinger Node.js App Manager** - It handles reverse proxy and SSL automatically
- ✅ **The app runs on port 3002** - Hostinger App Manager forwards `https://kimaimcp.urkitchenegypt.com` → `localhost:3002`

## Summary

Your deployment structure on server:
```
/home/u838631855/domains/kimaimcp.urkitchenegypt.com/
├── DO_NOT_UPLOAD_HERE
├── public_html/              ← NOT used for Node.js
└── urtime-mcp/               ← ✅ Your app here
    ├── packages/
    │   ├── server/
    │   │   ├── dist/         ← Built files
    │   │   ├── node_modules/ ← Dependencies (with better-sqlite3)
    │   │   └── .env          ← Configuration
    │   └── shared/
    │       ├── dist/
    │       └── node_modules/
    └── package.json
```

---

**That's it! Your app should now be running at `https://kimaimcp.urkitchenegypt.com`** 🎉

