#!/bin/bash
set -e

# Start script for subscription management server (Postgres / Prisma / NeonDB)
echo "[INFO] Starting Subscription Management Server..."

cd /app/server

echo "[INFO] Applying database schema (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[INFO] Seeding default data and bootstrapping admin user..."
node db/init.js

echo "[INFO] API key auth removed. Using session-based authentication."

# Start the application server
echo "[INFO] Starting server on port ${PORT:-3001}..."
exec node server.js
