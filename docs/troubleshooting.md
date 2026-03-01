# Troubleshooting

## OAuth / Authentication

**Auth page never opens on first connect**

This is a known Claude Desktop behavior. Fix:
1. Click Connect
2. Click Disconnect
3. Click Connect again — the auth page will open

**"Unauthorized" on every request**

Your token may have expired. Disconnect, reconnect, and re-authenticate.

---

## Connection Issues

**ngrok interstitial page blocks OpenAI**

ngrok free tier shows a browser warning page that breaks API clients. Options:
- Use a real domain (recommended)
- Upgrade to paid ngrok
- Use `cloudflared tunnel --url http://localhost:3002` (free, no interstitial)

**"Cannot connect to backend" error**

The Node.js server isn't running. Start it with:
```bash
node packages/server/dist/server.js
```

---

## Deployment

**Port 3002 already in use**
```bash
lsof -ti:3002 | xargs kill -9
```

**pnpm install fails on shared hosting**

Use the full deployment tarball instead (includes node_modules). Or use Docker.

**SSL certificate fails (IPv6 issue)**

If certbot fails with `unauthorized`, check if your domain has an AAAA record pointing to the wrong server. Remove it from your DNS panel and retry.

---

## Kimai API

**"Invalid credentials" after entering token**

Make sure you're using the **API token** from Kimai (not your login password).
Find it in Kimai → Profile → API Access.
