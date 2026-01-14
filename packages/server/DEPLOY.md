# Deployment Guide

Deploy the urTime MCP Server to a production server.

---

## Quick Glossary

| Term | What it is |
|------|------------|
| **SSL/HTTPS** | Encryption for web traffic. The padlock in your browser. Required so passwords aren't sent in plain text. |
| **Caddy** | A web server that automatically gets SSL certificates for free. Much simpler than Nginx. |
| **PM2** | Keeps your server running 24/7 and restarts it if it crashes. |
| **Reverse Proxy** | Caddy sits in front of your app, handles HTTPS, and forwards requests to your app. |

---

## Prerequisites

- Ubuntu/Debian server (e.g., Stinger)
- Domain pointing to your server's IP (e.g., `mcp.yourdomain.com`)
- Ports 80 and 443 open on firewall

---

## Step 1: Install Node.js & pnpm

```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should show v20.x.x

# Install pnpm
npm install -g pnpm
```

---

## Step 2: Clone and Build

```bash
# Clone your repo (replace with your GitHub URL)
git clone https://github.com/YOUR_USERNAME/urtime-mcp.git
cd urtime-mcp

# Install dependencies
pnpm install

# Build
pnpm build
```

---

## Step 3: Configure Environment

```bash
cd packages/server

# Copy example config
cp .env.example .env

# Generate a secure encryption key
openssl rand -hex 32
# This outputs something like: a1b2c3d4e5f6...
# Copy this value

# Edit the config
nano .env
```

**Set these values in .env:**
```bash
MCP_MODE=http
HTTP_BASE_URL=https://mcp.yourdomain.com   # <-- Your actual domain
ENCRYPTION_KEY=paste_the_key_you_generated  # <-- From openssl command
```

Save and exit (Ctrl+X, Y, Enter).

---

## Step 4: Install Caddy

Caddy is a web server that **automatically** gets and renews SSL certificates.

```bash
# Install dependencies
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl

# Add Caddy repository
curl -1sLf 'https://dl.cloudflare.com/cloudflare-stable.deb.sh' | sudo bash

# Install Caddy
sudo apt install caddy
```

**Alternative install method (if above fails):**
```bash
sudo apt install -y caddy
# Or download from: https://caddyserver.com/docs/install
```

---

## Step 5: Configure Caddy

```bash
sudo nano /etc/caddy/Caddyfile
```

**Delete everything and paste this (replace with your domain):**
```
mcp.yourdomain.com {
    reverse_proxy localhost:3002
}
```

Save and exit (Ctrl+X, Y, Enter).

**Start Caddy:**
```bash
sudo systemctl enable caddy
sudo systemctl restart caddy
```

Caddy will now:
- Automatically get an SSL certificate from Let's Encrypt
- Automatically renew it before it expires
- Redirect HTTP to HTTPS
- Forward requests to your MCP server on port 3002

---

## Step 6: Install PM2

PM2 keeps your server running and auto-restarts if it crashes.

```bash
# Install PM2 globally
npm install -g pm2

# Go to your server folder
cd ~/urtime-mcp/packages/server

# Start the MCP server
pm2 start npm --name "urtime-mcp" -- start

# Make it start automatically on reboot
pm2 startup
# Run the command it outputs, then:
pm2 save
```

**Useful PM2 commands:**
```bash
pm2 status           # Is it running?
pm2 logs urtime-mcp  # View logs
pm2 restart urtime-mcp  # Restart server
pm2 stop urtime-mcp     # Stop server
```

---

## Step 7: Open Firewall Ports

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Check status
sudo ufw status
```

---

## Step 8: Verify It Works

```bash
# Test health endpoint
curl https://mcp.yourdomain.com/health
```

**Expected response:**
```json
{"status":"ok","server":"urtime-kimai","version":"1.0.0","mode":"http"}
```

You can also open `https://mcp.yourdomain.com/health` in your browser.

---

## Step 9: Connect from Claude/ChatGPT

1. Open Claude or ChatGPT
2. Go to MCP/Connector settings
3. Add new server: `https://mcp.yourdomain.com`
4. You'll be redirected to the login page
5. Enter your Kimai URL and API token
6. Click Authorize
7. Done! Now ask Claude to manage your timesheets.

---

## Troubleshooting

### "This site can't be reached"
- Check domain DNS points to your server IP
- Check firewall: `sudo ufw status` (ports 80/443 should be open)

### "502 Bad Gateway"
- MCP server isn't running
- Check: `pm2 status`
- View logs: `pm2 logs urtime-mcp`

### "Certificate error"
- Caddy couldn't get SSL certificate
- Check Caddy logs: `sudo journalctl -u caddy`
- Make sure domain DNS is correct

### "OAuth redirect not working"
- Check `HTTP_BASE_URL` in `.env` matches your domain exactly
- Restart after changes: `pm2 restart urtime-mcp`

---

## Security Checklist

- [ ] HTTPS working (padlock in browser)
- [ ] `ENCRYPTION_KEY` is set (random 64-character hex)
- [ ] `.env` file is NOT committed to git
- [ ] Only ports 22, 80, 443 open on firewall
- [ ] Backup `data/auth.db` regularly (contains user credentials)

---

## Summary

| Step | Command |
|------|---------|
| Install Node | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt install -y nodejs` |
| Install pnpm | `npm install -g pnpm` |
| Clone & build | `git clone ... && pnpm install && pnpm build` |
| Configure | `cp .env.example .env && nano .env` |
| Install Caddy | `sudo apt install caddy` |
| Configure Caddy | `sudo nano /etc/caddy/Caddyfile` |
| Start Caddy | `sudo systemctl enable caddy && sudo systemctl restart caddy` |
| Install PM2 | `npm install -g pm2` |
| Start server | `pm2 start npm --name "urtime-mcp" -- start` |
| Auto-start | `pm2 startup && pm2 save` |
