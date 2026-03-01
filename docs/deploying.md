# Deploying Your Own Instance

## Docker (Recommended)

**1. Pull the image**
```bash
docker pull alimadany/urtime-mcp:latest
```

**2. Create docker-compose.yml**
```yaml
version: '3.8'
services:
  mcp:
    image: alimadany/urtime-mcp:latest
    restart: unless-stopped
    environment:
      - MCP_HTTP_MODE=true
      - HTTP_BASE_URL=https://your-domain.com
      - ENCRYPTION_KEY=your-64-char-hex-key
      - PORT=3002
    ports:
      - "3002:3002"
    volumes:
      - ./data:/app/packages/server/data
```

**3. Generate encryption key**
```bash
openssl rand -hex 32
```

**4. Start**
```bash
docker compose up -d
```

---

## nginx Config

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header Mcp-Session-Id $http_mcp_session_id;
        proxy_buffering off;
        proxy_cache off;
    }
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_HTTP_MODE` | Yes | Set to `true` for HTTP mode |
| `HTTP_BASE_URL` | Yes | Public URL of your server |
| `ENCRYPTION_KEY` | Yes | 64-char hex key for encrypting credentials |
| `PORT` | No | Port to listen on (default: 3002) |
| `CORS_ALLOWED_ORIGINS` | No | Restrict CORS origins (default: `*`) |

---

## SSL with Let's Encrypt

```bash
certbot certonly --webroot -w /var/www/certbot -d your-domain.com
```

Make sure your domain's A record points to your server before running this.
