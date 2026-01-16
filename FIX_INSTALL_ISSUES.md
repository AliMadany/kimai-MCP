# Fixing pnpm Install and Build Issues on Shared Hosting

## Problem 1: ERR_WORKER_INIT_FAILED EAGAIN

This happens because shared hosting has resource limits (process/thread limits).

## Problem 2: node_modules missing and tsc not found

The install didn't complete, so dependencies aren't installed.

---

## Solution 1: Retry pnpm install with reduced workers (Recommended)

```bash
# Try again with fewer workers (uses less resources)
pnpm install --config.workers=1

# If that doesn't work, try with no workspace protocol
pnpm install --no-link-workspace-packages

# Or try with different settings
pnpm install --prefer-offline --no-optional
```

---

## Solution 2: Use npm instead of pnpm (Fallback)

Since you're on shared hosting and pnpm is having resource issues, **use npm instead**:

```bash
# Remove pnpm files first (clean slate)
rm -rf node_modules packages/*/node_modules pnpm-lock.yaml

# Install with npm (uses package-lock.json if available, or creates one)
npm install

# Build with npm
npm run build
```

**Note**: npm works just fine for this project, even though it uses pnpm-workspace.yaml. npm will respect the workspace structure.

---

## Solution 3: Install workspace packages separately

```bash
# Install root dependencies first
npm install

# Install shared package
cd packages/shared
npm install
cd ../..

# Install server package
cd packages/server
npm install
cd ../..

# Build from root
npm run build
```

---

## Solution 4: Manual TypeScript installation and build

```bash
# Install TypeScript globally (if pnpm install partially worked)
npm install -g typescript

# Or install locally in each package
cd packages/shared
npm install typescript --save-dev
npx tsc
cd ../..

cd packages/server
npm install typescript --save-dev
npx tsc
cd ../..
```

---

## Quick Fix (Try This First)

```bash
# Clean up failed install
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp
rm -rf node_modules packages/*/node_modules

# Retry pnpm install with single worker
pnpm install --config.workers=1

# If that still fails, use npm
npm install
npm run build
```

---

## Recommended: Use npm (Simpler for Shared Hosting)

**npm is more stable on shared hosting with resource limits.**

```bash
cd /home/u838631855/domains/kimaimcp.urkitchenegypt.com/urtime-mcp

# Clean up
rm -rf node_modules packages/*/node_modules pnpm-lock.yaml

# Install with npm
npm install

# Build
npm run build

# Verify build
ls -la packages/server/dist/
ls -la packages/shared/dist/
```

The project will work fine with npm instead of pnpm! ✅

