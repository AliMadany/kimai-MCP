# Deployment Guide

Deploy the urTime MCP Server to a production server.

## Prerequisites

- Node.js 18+
- Domain with SSL certificate (HTTPS required)
- Nginx (recommended) or another reverse proxy

## Quick Deploy

```bash
# 1. Clone the repository
git clone <your-repo> && cd urtime-try-ref-to-mcp

# 2. Install dependencies
npm install

# 3. Build
npm run build

# 4. Configure
cd packages/mcp-server
cp .env.example .env

# 5. Edit .env with your values
nano .env
```

## Configuration

Edit `.env` with these required values:

```bash
# Your HTTPS domain
HTTP_BASE_URL=https://mcp.yourdomain.com

# Generate encryption key
openssl rand -hex 32
# Then add to .env:
ENCRYPTION_KEY=<your-generated-key>
```

## Nginx Configuration

Create `/etc/nginx/sites-available/mcp`:

```nginx
server {
    listen 80;
    server_name mcp.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mcp.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/mcp.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # SSE support
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/mcp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL Certificate (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mcp.yourdomain.com
```

## Process Manager (PM2)

Install and configure PM2:

```bash
# Install PM2
npm install -g pm2

# Start the server
cd packages/mcp-server
pm2 start npm --name "urtime-mcp" -- start

# Auto-start on reboot
pm2 startup
pm2 save
```

PM2 commands:

```bash
pm2 status          # Check status
pm2 logs urtime-mcp # View logs
pm2 restart urtime-mcp # Restart
pm2 stop urtime-mcp    # Stop
```

## Verify Deployment

```bash
# Health check
curl https://mcp.yourdomain.com/health

# Should return:
# {"status":"ok","server":"urtime-kimai","version":"1.0.0","mode":"http","sessions":0}

# OAuth metadata
curl https://mcp.yourdomain.com/.well-known/oauth-authorization-server
```

## Connect from Claude/ChatGPT

1. Go to MCP settings in Claude or ChatGPT
2. Add new connector with URL: `https://mcp.yourdomain.com`
3. Follow OAuth flow to enter your Kimai credentials
4. Start using Kimai tools

## Troubleshooting

**502 Bad Gateway**
- Check if server is running: `pm2 status`
- Check logs: `pm2 logs urtime-mcp`

**OAuth redirect issues**
- Ensure `HTTP_BASE_URL` matches your domain exactly
- Ensure HTTPS is working

**Connection refused**
- Check firewall: `sudo ufw status`
- Allow port 443: `sudo ufw allow 443`

## Security Checklist

- [ ] HTTPS enabled with valid certificate
- [ ] `ENCRYPTION_KEY` is set to a secure random value
- [ ] `CORS_ALLOWED_ORIGINS` is restricted (not `*`)
- [ ] Firewall configured (only 80/443 open)
- [ ] Regular backups of `data/auth.db`
