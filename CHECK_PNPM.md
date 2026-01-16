# Check if pnpm is Already Installed

Run these commands to check if pnpm is already available on your system:

```bash
# Method 1: Check if pnpm command exists
which pnpm

# Method 2: Try to run pnpm
pnpm --version

# Method 3: Check common installation locations

# Check in Node.js installation directory (Alt-NodeJS)
ls -la /opt/alt/alt-nodejs20/root/usr/bin/pnpm
ls -la /opt/alt/alt-nodejs22/root/usr/bin/pnpm
ls -la /opt/alt/alt-nodejs24/root/usr/bin/pnpm

# Check global npm directory
ls -la /opt/alt/alt-nodejs20/root/usr/lib/node_modules/pnpm
ls -la /opt/alt/alt-nodejs20/root/usr/bin/pnpm

# Check user directory
ls -la ~/.local/share/pnpm/pnpm 2>/dev/null
ls -la ~/.npm-global/bin/pnpm 2>/dev/null

# Check PATH
echo $PATH | grep -o '[^:]*' | xargs -I {} find {} -name pnpm 2>/dev/null

# Find pnpm anywhere
find /opt/alt/alt-nodejs* -name pnpm 2>/dev/null
find ~ -name pnpm 2>/dev/null | head -10
```

## If pnpm is Found

If any of these commands show pnpm exists, add it to your PATH:

```bash
# If found in Alt-NodeJS directory (example):
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
pnpm --version

# Make it permanent
echo 'export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"' >> ~/.bashrc
```

## If pnpm is NOT Found

Install it:

```bash
# Standard installation
npm install -g pnpm

# If that fails (permissions), use npx (no install needed)
npx pnpm install

# Or install locally in project
npm install pnpm --save-dev
# Then use: ./node_modules/.bin/pnpm install
```

## Quick Test

After finding/installing pnpm:

```bash
# Add Node.js to PATH (if not already done)
export PATH="/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

# Check pnpm
pnpm --version

# Should show version like: 9.x.x or 8.x.x
```

