# First AWS deployment

This guide follows the existing infrastructure in this repository. Preparation is safe to do now. Creating the state bucket, Secrets Manager secret, EC2/RDS stack or other paid resources requires approval of the account, region and cost plan first. Nothing in this guide has been applied to AWS by the coding agent.

## 1. Check the local release

From the repository root, run the checks in [validation.md](validation.md), including the production build and real Docker/browser tests. Fix failures before deploying. Push the tested application to your GitHub repository when ready; deployment uses `.github/workflows/deploy.yml` from that repository.

For the first release, use one EC2 `t3.medium`, one private RDS `db.t4g.micro`, S3 and ECR, with Redis on EC2. CloudFront and Multi-AZ are disabled. This configuration includes billable EC2, RDS, storage, public IPv4, logs, secrets and network transfer. It is not a free deployment or a high-availability setup. Estimate it for your chosen region using the [AWS Pricing Calculator](https://calculator.aws/) and approve the estimate before resource creation.

## 2. Install tools and authenticate

Install [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) and [Terraform](https://developer.hashicorp.com/terraform/install). Docker must be usable by your local user. If using S3 native state locking below, install Terraform 1.10 or later.

If your account uses IAM Identity Center, configure a named profile:

```bash
aws configure sso --profile photoforge
aws sso login --profile photoforge
export AWS_PROFILE=photoforge
# Replace the example with your selected AWS region.
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION="$AWS_REGION"
bash infrastructure/aws/preflight.sh --aws
```

If your account does not use Identity Center, configure an authorized named profile using your account's supported sign-in method. Never use root credentials, paste keys into chat, or put AWS access keys into the application dotenv file. The preflight command checks tools, Docker access and the active AWS account/role without creating resources or reading secrets. Confirm it identifies the intended account.

## 3. Prepare inputs and persistent state

Choose an existing domain/subdomain whose DNS you control, a globally unique S3 asset bucket name, and a region. A domain purchase is separate; do not assume one is already available.

```bash
cp infrastructure/aws/production.example.tfvars infrastructure/aws/production.tfvars
```

Edit the copied file. `web_origin` is the full HTTPS URL with no trailing slash. The application secret ARN must be a real secret in the same region, created only after approval. A Secrets Manager secret may initially hold a placeholder; replace it with the complete configuration after RDS exists. The EC2 instance can read only the secret ARN you supply. Do not put secret values in tfvars.

Use an existing dedicated, private, encrypted, versioned state bucket or arrange its approved creation separately. Do not use the application asset bucket, which does not exist before the first apply, as the initial state backend. Save a file named `infrastructure/aws/backend.tf` containing:

```hcl
terraform {
  backend "s3" {}
}
```

Initialize with your existing state bucket and selected region (replace the example bucket):

```bash
terraform -chdir=infrastructure/aws init \
  -backend-config="bucket=REPLACE_WITH_EXISTING_STATE_BUCKET" \
  -backend-config="key=photoforge/production.tfstate" \
  -backend-config="region=$AWS_REGION" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true"
terraform -chdir=infrastructure/aws fmt -check
terraform -chdir=infrastructure/aws validate
terraform -chdir=infrastructure/aws plan -var-file=production.tfvars -out=production.tfplan
```

The plan reads AWS metadata and writes a local plan; it does not create infrastructure. Review it and the estimate before any apply. Keep the generated `.terraform.lock.hcl` in Git. State, tfvars and saved plans are ignored because they may contain sensitive account data. S3 state locking requires permissions for the state and its `.tflock` object; see [HashiCorp's backend documentation](https://developer.hashicorp.com/terraform/language/backend/s3).

**Stop at the reviewed plan until resource creation is approved.** After an approved apply, record `terraform output`: EC2 instance ID, public IP, RDS endpoint and ECR repository URL.

## 4. Initialize RDS and the application secret

Use Systems Manager Session Manager to connect to the EC2 instance; no inbound SSH port is configured. Confirm `cloud-init status --wait` completed and Docker is running. The instance has an SSM role, and the selected Ubuntu AWS AMI normally includes SSM Agent; if it is offline, check the [agent installation guidance](https://docs.aws.amazon.com/systems-manager/latest/userguide/agent-install-ubuntu.html).

Connect to RDS from that private network using an authorized database administrator. Obtain the RDS-managed master credential through a separate administrative role. Do not grant the application instance access to the master secret. Create a `photoforge_app` login and give it ownership/DDL access to the dedicated application schema in the `photoforge` database, including rights needed by Prisma migrations. Use a password prompt or secure provisioning tool, not a password pasted into shell history. Verify migration and runtime privileges before proceeding; separate migration/runtime roles are a future hardening option.

Use [production.env.example](../infrastructure/aws/production.env.example) to prepare a mode-600 local file outside the repository. Replace every placeholder with the real RDS endpoint, URL-encoded application password, random JWT secret, domain, bucket and region. For example, generate the JWT value with `openssl rand -hex 32`. Verify PostgreSQL TLS and driver certificate validation; `sslmode=require` alone is not evidence of validated server identity.

After approval to update the secret, upload the file using `aws secretsmanager put-secret-value --secret-id YOUR_SECRET_ARN --secret-string file:///absolute/private/path/.env --region YOUR_REGION`, then securely remove the temporary local secret file according to your workstation policy. Do not print its contents in logs. AWS SDK storage access uses the EC2 instance role; leave local MinIO endpoints and static access keys out.

## 5. Configure DNS and GitHub deployment access

Create an A record for your chosen domain pointing at the Terraform public IP. Configure the GitHub `production` environment with these exact names:

| Kind     | Name                  | Value                           |
| -------- | --------------------- | ------------------------------- |
| Secret   | `AWS_DEPLOY_ROLE_ARN` | GitHub OIDC deployment role ARN |
| Secret   | `ENV_SECRET_ARN`      | Application dotenv secret ARN   |
| Variable | `AWS_REGION`          | Selected region                 |
| Variable | `S3_BUCKET`           | Terraform asset bucket name     |
| Variable | `EC2_INSTANCE_ID`     | Terraform instance ID           |
| Variable | `APP_URL`             | Exact HTTPS origin              |

Create or reuse the GitHub OIDC provider and a least-privilege deploy role as described in [deployment.md](deployment.md). For the current repository, the trust subject must be `repo:chiragpatel273/photoforge:environment:production`, with audience `sts.amazonaws.com`. Update that subject if the repository changes. Protect the environment and restrict deployment branches. Follow the [GitHub AWS OIDC guide](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws). Do not add long-lived AWS keys as GitHub secrets.

The workflow currently assumes the ECR repository is named `photoforge`; keep `name = "photoforge"` in the initial inputs. The existing workflow provisions neither the OIDC role nor the infrastructure. Configure its permissions before trying to release.

## 6. Release and verify

Once CI, infrastructure, database, secret, DNS and OIDC access are ready, manually run **Deploy approved AWS environment** from GitHub Actions. It runs validation, builds/pushes a uniquely tagged image, deploys its digest via SSM, runs migrations/seeds, waits for containers and checks HTTPS readiness.

The EC2 deployment script derives the AWS CLI region from the secret ARN, so it does not depend on an interactive AWS CLI profile on the server. Record the deployed digest, commit and SSM invocation. For failures, inspect the existing SSM invocation before retrying; the waiter may time out before a long pull completes.

Verify demo sign-in, create/upload/edit/save/refresh, processed images, background PDF export/download and mock checkout. Run browser tests with `E2E_BASE_URL=https://YOUR_DOMAIN`. Inspect CloudWatch logs, secure cookies, private storage and database access. Only then mark deployment verified. Follow [deployment.md](deployment.md) for rollback and operations; application rollback does not undo database migrations.
