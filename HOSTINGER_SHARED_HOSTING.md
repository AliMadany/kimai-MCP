# Installing Node.js on Hostinger Shared Hosting (No sudo/root access)

If you don't have `sudo` or `apt` access, you're likely on **shared hosting** or a limited environment. Here's how to install Node.js without root access.

---

## Step 1: Identify Your System

Run these commands to see what you have:

```bash
# Check your OS
uname -a
cat /etc/os-release

# Check what package managers are available
which apt
which yum
which apk
which rpm

# Check if you have wget or curl
which curl
which wget
```

---

## Option A: Install Node.js using NVM (No root access required)

**NVM (Node Version Manager)** can install Node.js in your home directory without root access.

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# If curl doesn't work, try wget:
# wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload your shell (or reconnect)
source ~/.bashrc
# Or:
source ~/.bash_profile
# Or:
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js 20
nvm install 20

# Use Node.js 20
nvm use 20

# Verify installation
node --version
npm --version

# Make it default
nvm alias default 20
```

---

## Option B: Install Node.js from Pre-built Binary

Download and extract Node.js directly to your home directory:

```bash
# Create directory for Node.js
mkdir -p ~/nodejs
cd ~/nodejs

# Download Node.js 20.x Linux binary (64-bit x64)
# First check your architecture:
uname -m

# If it shows x86_64 or amd64:
wget https://nodejs.org/dist/v20.11.0/node-v20.11.0-linux-x64.tar.xz

# If it shows arm64 or aarch64:
# wget https://nodejs.org/dist/v20.11.0/node-v20.11.0-linux-arm64.tar.xz

# Extract
tar -xf node-v20.11.0-linux-x64.tar.xz

# Move to a permanent location
mv node-v20.11.0-linux-x64 ~/nodejs/nodejs

# Add to PATH (add this to ~/.bashrc)
echo 'export PATH="$HOME/nodejs/nodejs/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify
node --version
npm --version
```

---

## Option C: Use Hostinger's Node.js (if available)

Some Hostinger shared hosting plans include Node.js. Check:

```bash
# Check if Node.js is already installed somewhere
which node
find /usr -name node 2>/dev/null
find /opt -name node 2>/dev/null

# Check common locations
ls -la /usr/local/bin/node
ls -la /opt/nodejs/bin/node
```

If Node.js is installed but not in PATH, add it:

```bash
# Find where it is, then add to PATH
echo 'export PATH="/path/to/nodejs/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

---

## Option D: Contact Hostinger Support

If none of the above work, you might need:

1. **Upgrade to VPS** - Shared hosting often doesn't allow custom Node.js installations
2. **Ask Hostinger** - They might have Node.js pre-installed or can install it for you
3. **Use their control panel** - Some Hostinger plans have Node.js manager in hPanel

---

## After Installing Node.js

Once Node.js is installed:

```bash
# Install pnpm globally (or use npx)
npm install -g pnpm

# Or if global install doesn't work, use npx:
# npx pnpm install

# Verify
pnpm --version
```

---

## Alternative: Check if Hostinger Has Node.js Pre-installed

Some Hostinger servers have Node.js available via their control panel:

1. Log into **hPanel** (Hostinger control panel)
2. Look for **"Node.js Selector"** or **"Node.js Version Manager"**
3. Select Node.js version 20.x
4. Follow their instructions

---

## Troubleshooting

### "bash: curl: command not found"

```bash
# Try wget instead
wget https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh
bash install.sh
```

### "Permission denied"

```bash
# Make sure you're installing in your home directory (~/)
# NOT in /usr or /opt (which require root)
mkdir -p ~/local
cd ~/local
# Continue with installation here
```

### NVM not found after installation

```bash
# Manually add NVM to your shell
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Add this to ~/.bashrc to make it permanent
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
source ~/.bashrc
```

---

## Quick Reference

**Best approach for shared hosting:**
```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# Install Node.js
nvm install 20
nvm use 20
nvm alias default 20

# Verify
node --version
npm --version
```

---

## Important Notes

1. **Shared hosting limitations**: Shared hosting may not allow you to:
   - Run long-running processes (like PM2)
   - Open custom ports (like 3002)
   - Install system-wide packages

2. **Consider VPS**: If you need full control, consider upgrading to Hostinger VPS:
   - Full root access
   - Can install anything
   - Can run background services
   - Can open custom ports

3. **Alternative deployment**: On shared hosting, you might need to:
   - Use Hostinger's built-in Node.js apps feature
   - Or deploy to a different platform (VPS, Heroku, Railway, etc.)

---

## Next Steps

Once Node.js is installed, continue with the main deployment guide, but note:
- You may not be able to use PM2 (shared hosting often kills long processes)
- You may not be able to use Caddy (needs root access)
- Consider using Hostinger's application manager or cron jobs to keep it running

