# Deploying urTime MCP Server on Hostinger VPS

This guide will walk you through deploying the urTime MCP Server on a Hostinger VPS server.

## Prerequisites

- A Hostinger VPS plan (any Linux VPS will work)
- SSH access to your server
- A domain name pointing to your server's IP address (or use Hostinger's provided subdomain)
- Basic command-line knowledge

---

## Overview: What This Code Does

The **urTime MCP Server** is a Node.js/TypeScript application that:

1. **Integrates Kimai Time Tracking** with AI assistants (Claude, ChatGPT)
2. **Provides OAuth 2.1 Authentication** - secure login system
3. **Runs as an HTTP Server** - accessible over the internet
4. **Stores Credentials Securely** - uses AES-256-GCM encryption with SQLite database

### Project Structure
```
urtime-mcp/
├── packages/
│   ├── server/      # Main MCP server with OAuth
│   └── shared/      # Kimai client library
├── package.json     # Root workspace config
└── pnpm-lock.yaml   # Dependency lock file
```

---

## Step 1: Connect to Your Hostinger VPS

1. Open your terminal/SSH client
2. Connect to your server:

```bash
ssh root@your-server-ip
# Or if you have a username:
ssh username@your-server-ip
```

**Note**: If this is your first time connecting, you'll need to accept the host key.

---

## Step 2: Update System and Install Node.js

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show npm version
```

---

## Step 3: Install pnpm (Package Manager)

```bash
# Install pnpm globally
npm install -g pnpm

# Verify installation
pnpm --version
```

---

## Step 4: Clone Your Repository

```bash
# Navigate to a suitable directory (e.g., /var/www or /home)
cd /var/www  # or cd ~/apps

# Clone your repository
# Replace with your actual Git repository URL
git clone https://github.com/YOUR_USERNAME/urtime-mcp.git
cd urtime-mcp

# If you don't have a Git repository yet, you can:
# 1. Create one on GitHub/GitLab
# 2. Or upload files via FTP/SCP
```

---

## Step 5: Install Dependencies and Build

```bash
# Make sure you're in the project root
cd /var/www/urtime-mcp  # or wherever you cloned it

# Install all dependencies
pnpm install

# Build the project
pnpm build

# Verify build succeeded
ls -la packages/server/dist/  # Should see compiled files
```

---

## Step 6: Configure Environment Variables

```bash
cd packages/server

# Create .env file
nano .env
```

**Paste the following configuration** (replace values with your own):

```bash
# Server Mode (must be 'http' for remote deployment)
MCP_MODE=http

# HTTP Server Configuration
HTTP_PORT=3002
HTTP_HOST=0.0.0.0
HTTP_BASE_URL=https://mcp.yourdomain.com  # <-- CHANGE THIS to your domain

# Security - Generate encryption key (see below)
ENCRYPTION_KEY=your-encryption-key-here    # <-- GENERATE THIS (see below)

# Optional: Logging
LOG_LEVEL=info
LOG_REQUESTS=true

# Optional: Kimai defaults (users can override via OAuth)
# KIMAI_BASE_URL=https://your-kimai-instance.com
```

### Generate Encryption Key

**Before saving the .env file**, generate a secure encryption key:

```bash
openssl rand -hex 32
```

This will output something like: `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456`

Copy this value and paste it as the `ENCRYPTION_KEY` value in your `.env` file.

**Save and exit** nano: `Ctrl+X`, then `Y`, then `Enter`.

---

## Step 7: Install and Configure Caddy (Web Server + SSL)

Caddy automatically handles HTTPS/SSL certificates for free.

```bash
# Install dependencies
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl

# Add Caddy repository
curl -1sLf 'https://dl.cloudflare.com/cloudflare-stable.deb.sh' | sudo bash

# Install Caddy
sudo apt install -y caddy

# Verify installation
caddy version
```

### Configure Caddy

```bash
# Edit Caddy configuration
sudo nano /etc/caddy/Caddyfile
```

**Delete everything** and paste this (replace `mcp.yourdomain.com` with your actual domain):

```
mcp.yourdomain.com {
    reverse_proxy localhost:3002
}
```

**Save and exit**: `Ctrl+X`, `Y`, `Enter`

### Start Caddy

```bash
# Enable Caddy to start on boot
sudo systemctl enable caddy

# Start Caddy
sudo systemctl start caddy

# Check status
sudo systemctl status caddy

# View logs if needed
sudo journalctl -u caddy -f
```

Caddy will automatically:
- Get an SSL certificate from Let's Encrypt
- Renew it before expiration
- Redirect HTTP to HTTPS

**Note**: Make sure your domain DNS is pointing to your server's IP address before starting Caddy.

---

## Step 8: Configure Firewall

```bash
# Allow SSH (if not already allowed)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall (if not already enabled)
sudo ufw enable

# Check status
sudo ufw status
```

---

## Step 9: Install PM2 (Process Manager)

PM2 keeps your server running 24/7 and automatically restarts it if it crashes.

```bash
# Install PM2 globally
npm install -g pm2

# Verify installation
pm2 --version
```

---

## Step 10: Start the Application with PM2

```bash
# Navigate to server directory
cd /var/www/urtime-mcp/packages/server

# Start the server
pm2 start npm --name "urtime-mcp" -- start

# Check if it's running
pm2 status

# View logs
pm2 logs urtime-mcp

# Make PM2 start on system reboot
pm2 startup
# This will output a command - copy and run it, then:
pm2 save
```

### Useful PM2 Commands

```bash
pm2 status              # Check status
pm2 logs urtime-mcp     # View logs
pm2 restart urtime-mcp  # Restart server
pm2 stop urtime-mcp     # Stop server
pm2 delete urtime-mcp   # Remove from PM2
pm2 monit               # Real-time monitoring
```

---

## Step 11: Verify Deployment

### Test Health Endpoint

```bash
# Test locally
curl http://localhost:3002/health

# Test via domain (from your server)
curl https://mcp.yourdomain.com/health
```

**Expected response:**
```json
{"status":"ok","server":"urtime-kimai","version":"1.0.0","mode":"http"}
```

### Test in Browser

Open `https://mcp.yourdomain.com/health` in your browser. You should see the JSON response.

### Test OAuth Endpoint

Visit `https://mcp.yourdomain.com/oauth/authorize` - you should see the authorization page.

---

## Troubleshooting

### Issue: "This site can't be reached"

**Solution:**
- Check DNS: `nslookup mcp.yourdomain.com` - should show your server IP
- Check firewall: `sudo ufw status` - ports 80 and 443 should be open
- Check if server is running: `pm2 status`

### Issue: "502 Bad Gateway"

**Solution:**
- Server isn't running: `pm2 status` - if not running, start it: `pm2 start urtime-mcp`
- Wrong port: Check `.env` has `HTTP_PORT=3002` and Caddyfile has `localhost:3002`
- View logs: `pm2 logs urtime-mcp` to see errors

### Issue: "Certificate error" or "SSL not working"

**Solution:**
- Check Caddy logs: `sudo journalctl -u caddy -n 50`
- Verify DNS is correct: Domain must point to server IP
- Restart Caddy: `sudo systemctl restart caddy`

### Issue: "ENCRYPTION_KEY is required"

**Solution:**
- Check `.env` file exists: `cat packages/server/.env`
- Verify `ENCRYPTION_KEY` is set (should be 64 characters)
- Restart server: `pm2 restart urtime-mcp`

### Issue: "Port already in use"

**Solution:**
```bash
# Find what's using port 3002
sudo lsof -i :3002

# Kill the process if needed, or change HTTP_PORT in .env
```

### View Detailed Logs

```bash
# PM2 logs (application logs)
pm2 logs urtime-mcp --lines 100

# Caddy logs (web server/SSL logs)
sudo journalctl -u caddy -n 100

# System logs
sudo journalctl -xe
```

---

## Updating Your Application

When you update your code:

```bash
# Navigate to project
cd /var/www/urtime-mcp

# Pull latest changes
git pull

# Install any new dependencies
pnpm install

# Rebuild
pnpm build

# Restart server
pm2 restart urtime-mcp
```

---

## Security Checklist

- [ ] HTTPS is working (padlock in browser)
- [ ] `ENCRYPTION_KEY` is set (random 64-character hex string)
- [ ] `.env` file is NOT committed to git (should be in `.gitignore`)
- [ ] Firewall is configured (only ports 22, 80, 443 open)
- [ ] PM2 is set to auto-start on reboot
- [ ] SSL certificate is valid (Caddy handles this automatically)
- [ ] Regular backups of `data/auth.db` (contains encrypted user credentials)

---

## Connecting from Claude/ChatGPT

Once your server is deployed and running:

1. Open Claude or ChatGPT
2. Go to MCP/Connector settings
3. Add new server: `https://mcp.yourdomain.com`
4. You'll be redirected to the login page
5. Enter your Kimai URL and API token
6. Click Authorize
7. Done! You can now ask Claude to manage your timesheets.

---

## Quick Reference Commands

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs

# Install pnpm
npm install -g pnpm

# Clone & build
git clone YOUR_REPO_URL && cd urtime-mcp && pnpm install && pnpm build

# Configure
cd packages/server && nano .env  # Set MCP_MODE=http, HTTP_BASE_URL, ENCRYPTION_KEY

# Install Caddy
curl -1sLf 'https://dl.cloudflare.com/cloudflare-stable.deb.sh' | sudo bash && sudo apt install -y caddy

# Configure Caddy
sudo nano /etc/caddy/Caddyfile  # Add domain config

# Start services
sudo systemctl enable caddy && sudo systemctl start caddy
npm install -g pm2
cd packages/server && pm2 start npm --name "urtime-mcp" -- start
pm2 startup && pm2 save

# Firewall
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
```

---

## Additional Hostinger-Specific Notes

### Hostinger Control Panel

If you have Hostinger's hPanel access:
- You can manage DNS records there
- You can view server logs in the control panel
- You can monitor resource usage (CPU, RAM, disk)

### Hostinger VPS Management

- Check your VPS resources: Make sure you have enough RAM/CPU
- Monitor disk space: `df -h`
- Check memory usage: `free -h`

### If Using Hostinger's Auto-SSL

If Hostinger provides free SSL certificates through their control panel:
- You can use Hostinger's SSL instead of Caddy
- Configure Nginx or Apache instead of Caddy
- Point your web server to `localhost:3002`

### Support

If you encounter issues:
1. Check PM2 logs: `pm2 logs urtime-mcp`
2. Check Caddy logs: `sudo journalctl -u caddy`
3. Verify environment variables: `cat packages/server/.env`
4. Test health endpoint: `curl http://localhost:3002/health`

---

## Summary

Your urTime MCP Server is now:
✅ Running on Hostinger VPS
✅ Accessible via HTTPS at `https://mcp.yourdomain.com`
✅ Automatically starting on server reboot
✅ Secured with SSL certificates (auto-renewed)
✅ Ready to accept connections from Claude/ChatGPT

Happy time tracking! 🎉

