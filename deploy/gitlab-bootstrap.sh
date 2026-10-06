#!/usr/bin/env bash
# One-shot: create the GitLab project, push code, and set CI/CD variables.
# Requires a GitLab *API* token (glpat-..., `api` scope) — the deploy token
# (gldt-) CANNOT do this. Run from the repo root:
#
#   GITLAB_API_TOKEN=glpat-xxxx bash deploy/gitlab-bootstrap.sh
#
set -euo pipefail

: "${GITLAB_API_TOKEN:?set GITLAB_API_TOKEN (glpat- with api scope)}"
HOST="${GITLAB_HOST:-https://gitlab.com}"
GROUP="${GITLAB_GROUP:-toolswave}"
PROJECT="${PROJECT:-app-builder}"
PROJ_PATH="${GROUP}/${PROJECT}"
ENC_PATH="${GROUP}%2F${PROJECT}"
H=(-H "PRIVATE-TOKEN: ${GITLAB_API_TOKEN}")

echo "==> resolving group ${GROUP}"
GID=$(curl -s "${H[@]}" "${HOST}/api/v4/groups/${GROUP}" | jq -r '.id')
[ "$GID" = "null" ] && { echo "group not found or token lacks api scope"; exit 1; }

echo "==> creating project ${PROJ_PATH} (idempotent)"
curl -s "${H[@]}" -X POST "${HOST}/api/v4/projects" \
  --data-urlencode "name=${PROJECT}" --data-urlencode "path=${PROJECT}" \
  --data "namespace_id=${GID}&visibility=private&initialize_with_readme=false" \
  | jq -r '.web_url // .message' || true

# Set a CI/CD variable (idempotent: delete then create)
setvar() {
  local key="$1" val="$2" masked="${3:-true}"
  [ -z "$val" ] && return 0
  curl -s -o /dev/null "${H[@]}" -X DELETE "${HOST}/api/v4/projects/${ENC_PATH}/variables/${key}" || true
  curl -s -o /dev/null "${H[@]}" -X POST "${HOST}/api/v4/projects/${ENC_PATH}/variables" \
    --data-urlencode "key=${key}" --data-urlencode "value=${val}" \
    --data "masked=${masked}&protected=false"
  echo "   set ${key}"
}

echo "==> setting CI/CD variables from .env + .deploy-secrets"
# shellcheck disable=SC1091
set -a; [ -f .env ] && . ./.env; set +a
setvar ANTHROPIC_API_KEY "${ANTHROPIC_API_KEY:-}"
setvar CF_API_TOKEN "${CF_API_TOKEN:-}"
setvar CF_ACCOUNT_ID "${CF_ACCOUNT_ID:-}" false
setvar JWT_SECRET "$(openssl rand -hex 32)"
setvar DEPLOY_HOST "${DEPLOY_HOST:-100.100.164.92}" false
setvar DEPLOY_SSH_PASS "$(sed -n 's/^ROOT_SSH_PASS=//p' .deploy-secrets 2>/dev/null || true)"

echo "==> pushing code"
git remote remove gitlab 2>/dev/null || true
git remote add gitlab "${HOST/https:\/\//https://oauth2:${GITLAB_API_TOKEN}@}/${PROJ_PATH}.git"
git push -u gitlab HEAD:main

echo "==> done. Pipeline will run at ${HOST}/${PROJ_PATH}/-/pipelines"
