#!/usr/bin/env bash
set -euo pipefail
: "${IMAGE:?Use an immutable ECR image digest}"
: "${DEPLOY_SECRET_ARN:?Set the application environment secret ARN}"
cd /opt/photoforge
umask 077
aws secretsmanager get-secret-value --secret-id "$DEPLOY_SECRET_ARN" --query SecretString --output text > .env.new
mv .env.new .env
if [[ -f current-image ]]; then cp current-image previous-image; fi
registry_host=${IMAGE%%/*}
aws ecr get-login-password | docker login --username AWS --password-stdin "$registry_host"
docker compose -f compose.production.yml pull
docker compose -f compose.production.yml up -d --wait --wait-timeout 240
printf '%s\n' "$IMAGE" > current-image
# Schema changes must remain backward compatible with previous-image. Do not roll back the DB automatically.
