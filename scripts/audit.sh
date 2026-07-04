#!/usr/bin/env bash
set -euo pipefail

echo "== Repo map =="
pwd
ls -la

echo ""
echo "== Package files =="
find . -maxdepth 3 \( -name package.json -o -name pnpm-lock.yaml -o -name yarn.lock -o -name bun.lockb -o -name prisma -o -name Dockerfile -o -name docker-compose.yml \) | sort

echo ""
echo "== Environment references =="
grep -RIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build "process\.env\|import\.meta\.env\|NEXT_PUBLIC_\|VITE_" . || true

echo ""
echo "== Auth references =="
grep -RIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build "next-auth\|auth\.|clerk\|supabase\|firebase\|jwt\|session" . || true

echo ""
echo "== API routes and handlers =="
find . \( -path "*/app/api/*" -o -path "*/pages/api/*" -o -path "*/src/app/api/*" \) | sort || true

echo ""
echo "== Dangerous patterns =="
grep -RIn --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=build "eval\(|dangerouslySetInnerHTML|child_process|exec\(|spawn\(|SELECT \*|raw\(|innerHTML\s*=|localStorage|sessionStorage" . || true

echo ""
echo "== Scripts =="
node -e "const fs=require('fs'); const p=['package.json','./package.json'].find(f=>fs.existsSync(f)); if(!p){console.log('no package.json'); process.exit(0)}; const pkg=JSON.parse(fs.readFileSync(p,'utf8')); console.log(pkg.scripts||{})"

echo ""
echo "== Suggested next commands =="
echo "npm install"
echo "npm run lint || true"
echo "npm run typecheck || true"
echo "npm test || true"
echo "npm run build || true"
