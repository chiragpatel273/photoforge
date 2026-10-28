# AWS deployment and operations

For the ordered first-release walkthrough and configuration examples, start with [First AWS deployment](aws-first-deployment.md).

## Approval and status

No AWS resources have been provisioned. The Terraform source is an opt-in deployment starting point and has not been validated/applied with Terraform or an AWS account in this environment. Do not run `terraform apply` until costs and changes are explicitly approved. EC2, EBS, public IPv4, RDS, Secrets Manager, logs, S3 and optional CloudFront incur charges. Multi-AZ and CloudFront default off; no NAT gateway, ALB, autoscaling group, or ElastiCache is provisioned for the initial instance.

## Provisioning

1. Complete the checks in `validation.md`, use the committed pnpm lockfile with frozen installs and review pinned image dependencies. Run `terraform fmt -check`, `terraform init`, `terraform validate`, and a reviewed `terraform plan` in `infrastructure/aws`. Configure an encrypted remote state backend and locking before applying. State/output access must be restricted.
2. Prepare a dedicated Secrets Manager secret ARN for application configuration; no values are in Terraform. Set region, unique bucket name, exact HTTPS origin and secret ARN through approved tfvars. Review engine/AMI availability and instance costs in the selected region. Apply only after explicit approval.
3. The stack creates a VPC/public application subnet, two private DB subnets, private encrypted RDS PostgreSQL, S3 with private access/encryption/CORS, ECR, EC2/IMDSv2, SSM role, CloudWatch log group/alarm and optional public-marketing-only CloudFront. There is no inbound SSH. Use Session Manager.
4. Create a database application/migration role on the private RDS host from an authorized SSM session. Retrieve the managed RDS administrative credential through a separate administrative role, not the app instance role. Give the application role privileges for its own schema/database only. Test `sslmode=require` and RDS CA validation with the deployed driver.
5. Store a complete dotenv document in the application secret. Include `DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN=https://your-domain`, `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE=false`, `DOMAIN=your-domain`, `API_INTERNAL_URL=http://api:4000`, and `PORT=4000`. Omit local S3 endpoints and static AWS keys so SDKs use the instance role. Redis URL is supplied by production Compose. Never print the secret in a workflow or commit it.
6. Point DNS at the instance Elastic IP. Caddy obtains/renews TLS and redirects HTTP to HTTPS. Verify ACME DNS/firewall requirements. The instance bootstrap installs Docker/Compose/AWS CLI; inspect cloud-init completion before the first deployment.
7. Configure a protected GitHub `production` environment. Set `AWS_DEPLOY_ROLE_ARN`, `ENV_SECRET_ARN` as secrets and `AWS_REGION`, `S3_BUCKET`, `EC2_INSTANCE_ID`, `APP_URL` as environment variables. The ECR repository is named `photoforge` by default; update the workflow if changing it.
8. Create an AWS OIDC trust for GitHub limited to this repository's `environment:production` subject. The deploy role needs ECR push/read actions for this repository, `ecr:GetAuthorizationToken`, S3 PutObject for `deployment/*`, SSM SendCommand restricted to the instance and AWS-RunShellScript document, and GetCommandInvocation for its commands. Do not grant AdministratorAccess. CloudWatch notification actions/budget alarms and on-call destinations must be configured separately.
9. Run the deployment workflow manually after CI passes. It builds an immutable image, uploads versioned runtime config, invokes deployment with SSM, runs migrations/seeds before application startup, waits for container health and checks HTTPS readiness. Keep deployed commit/digest/SSM invocation IDs in the release record.

The image contains all app roles and migration/test tooling to keep this MVP simple; it is larger than a separate pruned image for each role. Production runtime uses a non-root application user. Container image updates, base image CVEs and transitive dependency patches remain operational responsibilities.

## CI/CD

`ci.yml` performs install, Prisma generation, shared build, workspace type checks, ESLint, Jest and production build, then validates Compose and builds Docker. A separate job starts the complete Compose stack, runs real DB/Redis ownership/retry integration tests and the browser upload/export flow, and retains artifacts.

`deploy.yml` is manual and targets the protected production environment. CI is a prerequisite reusable workflow. It never applies Terraform or provisions resources. Application builds install the committed lockfile with frozen resolution. Each image tag includes the commit SHA, workflow run ID and run attempt, so rerunning a release does not overwrite an immutable ECR tag. Services deploy by image digest; record the previous digest for rollback.

The deployment script writes a mode-600 environment file from Secrets Manager without echoing it. ECR digest selects the exact built image. API/worker output goes to `/photoforge/services` in CloudWatch with 14-day retention. Local Redis data, Caddy state and certificates persist in volumes. RDS has seven-day backups; test restoration to a disposable instance before considering recovery verified.

## Verification

Check `/`, registration/demo authentication, `/api/health`, `/api/ready`, storage CORS/signatures, upload to READY, save/refresh, preview and export to READY, signed PDF download, mock checkout, and cross-user authorization. Run Playwright against HTTPS via `E2E_BASE_URL`. Inspect the actual PDF's dimensions, trim/bleed boxes, text, rotation and crops. Readiness checks DB/Redis connectivity; it does not prove S3 availability or worker throughput. Worker health checks a short-lived Redis heartbeat; combine it with queue-age monitoring.

Also verify security groups do not expose database/Redis, buckets reject anonymous reads, production cookies are Secure, secrets do not appear in logs, and a restarted worker recovers interrupted jobs. Record evidence separately from configuration preparation.

## Rollback

Before deploying, `/opt/photoforge/deploy.sh` retains `previous-image`. To roll back app code, use an authorized SSM session:

```bash
cd /opt/photoforge
export IMAGE=$(cat previous-image)
docker compose -f compose.production.yml up -d --wait --wait-timeout 240
```

Verify HTTPS readiness and an end-to-end export. Record which digest is active. Preserve versioned runtime configuration alongside image references; restore the previous config archive too when a release changed Compose/Caddy configuration. Application rollback **does not roll back database migrations**. Use backward-compatible expand/migrate/contract changes; if a migration requires recovery, restore from a tested RDS backup to a new database and approve the cutover. Do not automatically destroy data to make old code work.

A failed initial deployment has no prior image to restore. The SSM command waiter may time out while Docker is still running; inspect the existing invocation before retrying and avoid starting concurrent releases.

## Operations and future options

Watch request errors/latency, EC2 CPU and disk/RSS, RDS connections/storage, Redis memory/persistence and oldest queued job age. The provided CPU alarm has no notification target; attach an approved SNS/on-call action. Failed jobs are retained in the `images`/`pdfs` BullMQ failed sets for inspection, not silently dropped. Retry through the API or inspect with a restricted operational script. Set a review/retention policy for dead letters.

Run expired-guest cleanup on an approved schedule using a restricted cleanup role with `s3:DeleteObject` on `users/*`. Member deletions currently leave orphan files; introduce reference-aware object garbage collection before long-running public use. Do not expire canonical originals globally while active books/orders may still reference them.

For optional ElastiCache, remove the local Redis service/dependency and use a private TLS `rediss://` URL, security group access limited to app/worker roles, and compatible noeviction/persistence settings. For optional CloudFront, the Terraform OAC distribution serves only `public/*`; user photographs/PDFs continue using private signed S3 access. Do not route signed user assets through an anonymously cached distribution.

Enable Multi-AZ RDS and deploy multiple API/worker instances only after explicit cost approval. Move Redis to a shared managed service before adding EC2 replicas; use an ALB and shared session/rate-limit/job infrastructure. No autoscaling, read replica or HA deployment is claimed here.
