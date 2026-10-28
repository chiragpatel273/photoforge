#!/usr/bin/env bash
set -euo pipefail
: "${IMAGE:?Use an immutable ECR image digest}"
: "${DEPLOY_SECRET_ARN:?Set the application environment secret ARN}"
# AWS CLI does not infer its region from an EC2 instance or secret ARN.
# Derive it from the regional secret so SSM needs no preconfigured AWS profile.
if [[ "$DEPLOY_SECRET_ARN" =~ ^arn:aws[a-z-]*:secretsmanager:([a-z0-9-]+):[0-9]{12}:secret:.+$ ]]; then
  export AWS_REGION="${BASH_REMATCH[1]}"
  export AWS_DEFAULT_REGION="$AWS_REGION"
else
  printf '%s\n' 'DEPLOY_SECRET_ARN must be a complete Secrets Manager ARN' >&2
  exit 1
fi
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
