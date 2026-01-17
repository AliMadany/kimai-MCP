# Deploy to Hostinger using public_html

This guide shows how to deploy the Node.js app so it's accessible via `public_html` without using hPanel Node.js Manager.

## Architecture

- **Node.js app** runs in background (port 3002)
- **public_html** proxies requests to Node.js via PHP or .htaccess
- **SSL** handled by Hostinger (automatic for public_html)

---

## Step 1: Upload and Extract Files

```bash
# Upload deploy-hostinger.tar.gz to server
# Then extract and organize:

cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com

# Extract to urtime-mcp directory
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

---

## Step 2: Configure .env File

```bash
cd packages/server

# Generate encryption key
openssl rand -hex 32

# Create .env file
nano .env
```

**Paste this (replace YOUR_KEY_HERE with generated key):**

```bash
MCP_MODE=http
HTTP_PORT=3002
HTTP_HOST=127.0.0.1
HTTP_BASE_URL=https://kimaimcp.urkitchenegypt.com
ENCRYPTION_KEY=YOUR_KEY_HERE
LOG_LEVEL=info
LOG_REQUESTS=true
```

**Note**: Set `HTTP_HOST=127.0.0.1` (localhost) for security - only public_html will access it.

---

## Step 3: Start Node.js Server

### Option A: Using nohup (Simple)

```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server

export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

# Start in background
nohup npm start > server.log 2>&1 &

# Save PID
echo $! > server.pid

# Check if running
ps aux | grep node
tail -f server.log
```

### Option B: Using PM2 (Better - auto-restart)

```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server

export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

# Install PM2 globally (if not already)
npm install -g pm2 --prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH

# Start with PM2
pm2 start npm --name "urtime-mcp" -- start

# Save PM2 config
pm2 save
```

---

## Step 4: Set Up Proxy in public_html

You have two options:

### Option A: PHP Proxy (Recommended - Most Compatible)

1. **Upload `public_html-proxy.php` to `public_html/`**
2. **Rename it to `index.php`** (or create a symlink):

```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/public_html

# Copy PHP proxy
cp ../urtime-mcp/public_html-proxy.php index.php

# Or if you upload it directly, just rename:
# mv public_html-proxy.php index.php
```

3. **Test**: Visit `https://kimaimcp.urkitchenegypt.com/health`

### Option B: Apache .htaccess (If mod_proxy is enabled)

**Note**: Many shared hosting providers disable mod_proxy for security. Try Option A first.

1. **Upload `.htaccess-proxy` to `public_html/.htaccess`**:

```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/public_html

# Copy .htaccess
cp ../urtime-mcp/.htaccess-proxy .htaccess
```

2. **Test**: Visit `https://kimaimcp.urkitchenegypt.com/health`

---

## Step 5: Verify Everything Works

```bash
# 1. Check Node.js is running
ps aux | grep node
# OR
tail -f /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server/server.log

# 2. Test directly (should work)
curl http://127.0.0.1:3002/health

# 3. Test via public_html (should also work)
curl https://kimaimcp.urkitchenegypt.com/health
```

**Expected response:**
```json
{"status":"ok","server":"urtime-kimai","version":"1.0.0","mode":"http"}
```

---

## Step 6: Keep Server Running (Auto-start)

### Using Cron Job (Simple)

```bash
# Edit crontab
crontab -e

# Add this line (runs every 5 minutes to check if server is running)
*/5 * * * * cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server && export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH" && [ -f server.pid ] && ps -p $(cat server.pid) > /dev/null || (nohup npm start > server.log 2>&1 & echo $! > server.pid)
```

### Using PM2 Startup (Better)

```bash
# If using PM2
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

pm2 startup
# Follow the instructions it outputs
pm2 save
```

---

## Troubleshooting

### Server not starting

```bash
# Check logs
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
tail -100 server.log

# Check if port 3002 is in use
netstat -tuln | grep 3002

# Try starting manually to see errors
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
npm start
```

### PHP proxy not working

```bash
# Check PHP errors
tail -f /home/u838631855/domains/kimaimcp.urkitchenegypt.com/public_html/error_log

# Test PHP file directly
cd public_html
php index.php

# Check if cURL is enabled in PHP
php -m | grep curl
```

### .htaccess proxy not working

Apache mod_proxy might be disabled. Use the PHP proxy (Option A) instead.

### "502 Bad Gateway" or "503 Service Unavailable"

Node.js server isn't running. Start it:

```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
nohup npm start > server.log 2>&1 & echo $! > server.pid
```

---

## File Structure After Deployment

```
/home/u838631855/domains/kimaimcp.urkitchenegypt.com/
├── public_html/
│   ├── index.php          ← PHP proxy to Node.js
│   └── .htaccess          ← (Optional) Apache proxy
├── urtime-mcp/            ← Node.js app (outside public_html)
│   ├── packages/
│   │   ├── server/
│   │   │   ├── dist/
│   │   │   ├── node_modules/
│   │   │   ├── .env
│   │   │   ├── server.pid
│   │   │   └── server.log
│   │   └── shared/
│   └── package.json
└── deploy-hostinger.tar.gz
```

---

## Quick Reference Commands

### Start Server
```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
nohup npm start > server.log 2>&1 & echo $! > server.pid
```

### Stop Server
```bash
kill $(cat /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server/server.pid)
```

### View Logs
```bash
tail -f /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server/server.log
```

### Restart Server
```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp/packages/server
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
kill $(cat server.pid) 2>/dev/null
nohup npm start > server.log 2>&1 & echo $! > server.pid
```

---

**That's it! Your app should now be accessible at `https://kimaimcp.urkitchenegypt.com`** 🎉

