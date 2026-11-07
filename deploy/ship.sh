#!/usr/bin/env bash
# Build HEAD for the server (linux/amd64), push it to ghcr.io, and run it there.
#   deploy/ship.sh                 build HEAD (unless ghcr.io has it), push, deploy
#   TAG=<sha> deploy/ship.sh       deploy an image already in ghcr.io (a rollback)
# Needs: the `nearvana-contabo` ssh host, docker signed in to ghcr.io with write:packages for
# nearvanapad, and ~/apps/vana-agent/.env on the server (deploy/env.example). The server logs in
# to ghcr.io with the same credentials for the pull only, then logs out again.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=${DEPLOY_HOST:-nearvana-contabo}
DIR=${DEPLOY_DIR:-/root/apps/vana-agent}
REPO=ghcr.io/nearvanapad/vana-agent

say() { echo "==> $*"; }
die() { echo "✗ $*" >&2; exit 1; }

if [ -z "${TAG:-}" ]; then
  [ -z "$(git status --porcelain)" ] || die "Uncommitted changes: commit first, so the tag names what runs."
  TAG=$(git rev-parse --short=7 HEAD)
fi
REF=$REPO:$TAG

helper=$(python3 -c 'import json,os; print(json.load(open(os.path.expanduser("~/.docker/config.json"))).get("credsStore",""))')
[ -n "$helper" ] || die "No docker credential store: run docker login ghcr.io."
CREDS=$(echo ghcr.io | "docker-credential-$helper" get | python3 -c 'import json,sys; c=json.load(sys.stdin); print(c["Username"], c["Secret"])')

if docker manifest inspect "$REF" >/dev/null 2>&1; then
  say "$REF is already in ghcr.io"
else
  [ "$TAG" = "$(git rev-parse --short=7 HEAD)" ] || die "$REF is not in ghcr.io; ship without TAG to build HEAD."
  args=()
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^(NEXT_PUBLIC_[A-Z0-9_]+)=(.*)$ ]] && args+=(--build-arg "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}")
  done <deploy/build.env
  say "Building $REF"
  docker buildx build --platform linux/amd64 "${args[@]}" \
    --label "org.opencontainers.image.source=https://github.com/nearvanapad/vana-agent" \
    -t "$REF" --push .
fi

say "Deploying $REF on $HOST"
# shellcheck disable=SC2029  # $DIR expands here on purpose
ssh "$HOST" "mkdir -p $DIR" && scp -q deploy/compose.yml "$HOST:$DIR/compose.yml"
# The first stdin line is the ghcr.io login; the rest is the script, read whole before it runs.
{
  echo "$CREDS"
  cat <<'EOS'
main() {
  set -uo pipefail
  dir=$1 ref=$2
  cd "$dir" || exit 1
  [ -f .env ] || { echo "No $dir/.env: copy deploy/env.example there and fill it in." >&2; exit 1; }
  prev=$(sed -n 's/^IMAGE=//p' .env)
  if grep -q '^IMAGE=' .env; then sed -i "s|^IMAGE=.*|IMAGE=$ref|" .env; else printf '\nIMAGE=%s\n' "$ref" >>.env; fi

  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null 2>&1
  unset GHCR_TOKEN
  docker compose pull -q; status=$?
  docker logout ghcr.io >/dev/null
  if [ "$status" != 0 ]; then
    [ -n "$prev" ] && sed -i "s|^IMAGE=.*|IMAGE=$prev|" .env
    echo "✗ docker compose pull failed" >&2; exit 1
  fi

  docker compose up -d --remove-orphans || exit 1
  for _ in $(seq 1 45); do
    h=$(docker inspect -f '{{.State.Health.Status}}' vana-agent 2>/dev/null)
    if [ "$h" = healthy ]; then
      docker image ls ghcr.io/nearvanapad/vana-agent --format '{{.Repository}}:{{.Tag}}' | tail -n +4 | xargs -r docker rmi >/dev/null 2>&1
      echo "✓ $ref is up"; exit 0
    fi
    sleep 2
  done
  echo "✗ not healthy; last log lines:"; docker compose logs --tail=30 app
  if [ -n "$prev" ]; then
    echo "==> Rolling back to $prev"
    sed -i "s|^IMAGE=.*|IMAGE=$prev|" .env
    docker compose up -d
  fi
  exit 1
}
EOS
  echo "main $DIR $REF"
} | ssh "$HOST" 'read -r GHCR_USER GHCR_TOKEN; export GHCR_USER GHCR_TOKEN; exec bash -s'
