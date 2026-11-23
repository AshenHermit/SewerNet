set -Eeuo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/home/SewerNet}"
REF="${1:-0.1.0}"

cd "$DEPLOY_PATH"

echo "[deploy] Pulling latest code..."
git fetch --all
git checkout "$REF"
git pull origin "$REF"

echo "[deploy] Building and starting containers..."
docker compose up -d --build

echo "[deploy] Pruning unused images..."
docker image prune -f

echo "[deploy] Done."