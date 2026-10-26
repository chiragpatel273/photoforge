# Validation record — 2026-10-22

This record distinguishes source implementation from executed verification. There is no live deployment or fully verified MVP claim.

## Executed successfully

| Check                               | Evidence                                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependency-independent test suite   | **6 passed**, 0 failed; pricing, invalid page counts, DPI, password salt/verification, malformed hashes, retry policy                                              |
| Strict standalone TypeScript checks | `password.ts` and `domain.ts`, strict, no emit, Node 24 types; passed                                                                                              |
| All TypeScript syntax               | **56 source files**, 0 transpilation diagnostics; this is not full semantic type checking                                                                          |
| Initial SQL migration               | Applied to disposable PostgreSQL **18.6** in single-user mode, 0 SQL errors; Compose targets PostgreSQL 17 and still needs its integration run                     |
| Relational SQL smoke test           | `tests/database-smoke.sql`: revision update, foreign-key rejection, cascading pages, order snapshot retention on book deletion, transaction rollback; 0 SQL errors |
| Local Compose configuration         | `docker compose config --quiet` passed                                                                                                                             |
| Production Compose configuration    | Parsed with nonsecret image/domain/region values and project directory set to the checkout; passed                                                                 |
| Deployment shell                    | `bash -n infrastructure/deploy.sh` passed                                                                                                                          |
| YAML / JSON                         | All five YAML files and all JSON manifests parsed                                                                                                                  |
| Secret exclusion                    | Local `.env` is Git-ignored and excluded from the Docker context                                                                                                   |

The host already had a TypeScript/tsx toolchain in another project. That existing toolchain was used without changing that project or introducing replacement package stubs:

```text
node --import /home/dell/sample-projects/typescript-incident-lab/node_modules/tsx/dist/loader.mjs tests/offline.test.ts
NODE_PATH=/home/dell/sample-projects/typescript-incident-lab/node_modules node scripts/check-syntax.cjs
```

After dependency installation, the normal equivalents are `pnpm test:offline` and `pnpm check:syntax`. The syntax check is intentionally separate from `pnpm typecheck`.

The database daemon could not bind a socket, so the committed migration and SQL fixture were executed using PostgreSQL's standalone `--single` mode against an isolated temporary cluster. Each invocation exited and its output was inspected for SQL errors. This checks the SQL and relational invariants; it does not exercise Prisma, network connectivity, API authorization, or the application workflow.

## Blocked checks and evidence

- npm registry DNS lookup failed (`EAI_AGAIN` / could not resolve `registry.npmjs.org`). Corepack could not fetch pnpm 10.28.0, even with a writable temporary Corepack cache. Required React, Next.js, Prisma, BullMQ, Sharp and other packages are absent from the available offline cache. An offline install attempt failed with `ENOTCACHED`.
- Docker daemon access returned permission denied at `/var/run/docker.sock`. Compose configuration parsing works without a daemon, but images/containers cannot be built or run here.
- A temporary PostgreSQL server failed to create its Unix socket with `Operation not permitted`. The standalone SQL checks described above were used instead.
- Terraform is not installed. No provider initialization, Terraform validation/plan, AWS API operations, or cloud provisioning was performed.

## Outstanding release gates

Startup follow-up: a user reported that Docker Hub rejects the original `minio/minio` image. Local Compose now uses the same release from Coollabs GHCR, pinned to the multi-platform digest published on its GitHub package page. Compose configuration was revalidated; an actual image pull/container run remains unverified from this agent environment.

1. Install the workspace dependencies online, resolve any compatibility/type/lint failures, generate and commit `pnpm-lock.yaml`, and switch installs to `--frozen-lockfile`.
2. Run Prisma generation/validation, full workspace type checks, ESLint, all Jest/component tests and production builds. Fix any failures before claiming these pass.
3. Build and start the complete Compose stack on a permitted Docker host. Run the real Fastify/PostgreSQL/Redis integration suites and BullMQ retry tests.
4. Run Playwright's create/upload/customize/save/refresh/export/download workflow. Review its real dashboard/editor/export screenshots and inspect the actual PDF.
5. Exercise upload failures, stale revisions, job recovery, guest expiry/cleanup, cookie security and cross-user access in the running stack.
6. Format and validate Terraform against a selected AWS account/region, review a plan and costs, and obtain explicit approval before creating resources.
7. After an approved deployment, verify HTTPS, signed uploads/downloads, worker processing, health checks, logs, restart/recovery and rollback. Record evidence here separately.

## Milestone status

| Milestone      | Source delivered                                                                             | Verification status                                                     |
| -------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1 Foundation   | Monorepo, Next, Fastify, relational schema/migration/seed, Redis/Compose, authentication, UI | SQL and standalone checks passed; application execution blocked         |
| 2 Editor       | Templates, Konva, Zustand/history, geometry/crop/text/layers/pages, autosave/preview         | Syntax checked; browser behavior unverified                             |
| 3 Processing   | Presigned upload flow, Sharp worker, BullMQ recovery/retries, PDF/secure download            | Implemented; dependency/service tests unexecuted                        |
| 4 Readiness    | Validation/ownership, security headers/rate limits, tests, health/shutdown, caching          | Partial independent verification; full gates outstanding                |
| 5 AWS          | EC2/RDS/S3/IAM/CloudWatch Terraform, production Compose/HTTPS, CI/CD/rollback                | Configuration prepared, no resources provisioned or deployed            |
| 6 Enhancements | Optional public-asset CloudFront configuration, k6 scenario, scaling documentation           | Not provisioned or benchmarked; further enhancements remain future work |

No benchmark numbers, production traffic, printer compliance, successful browser run, or successful cloud deployment are inferred from source code/configuration alone.

## Build-error follow-up

A user Docker build successfully installed dependencies, generated Prisma Client 6.19.3, and built the shared package, then failed compiling the API. This is evidence of a failed application build, not a successful release build.

Corrections: the base server compiler now uses Node16 module/module resolution to honor package subpath exports; production Fastify trust is expressed as an explicit hop predicate instead of an unsupported numeric option; the OpenAPI helper and schemas use the Zod v3 entry point and a ZodSchema boundary; book duplication uses an explicitly typed asset map and discriminated element branches.

Executed checks for this correction: TypeScript resolved the actual shared package export map using a temporary declaration fixture, and the actual API Fastify factory expression type-checked against the host's real Fastify types with the expected HTTP server inference. All 57 TypeScript source files passed syntax checks, the six standalone tests passed, and local Compose configuration parsed. The new Jest contract tests have not run because their dependencies remain unavailable to this agent. These isolated checks do not replace the outstanding full Docker/application build.

## Frontend narrowing follow-up — 2026-10-23

The next user build generated Prisma Client and compiled the shared package, API, and worker successfully. Next.js compiled the frontend bundle, then failed its TypeScript stage because the editor checked `book.error` again after an earlier error branch had already returned. The unreachable second error branch was removed; the original error UI still renders for failed requests and loading still renders for pending/initializing books. All 57 TypeScript source files passed syntax checks after the edit. A search of the remaining frontend query guards found no matching duplicate pattern. Full frontend/Docker build and application startup remain unverified by this agent.

## Runtime startup follow-up — 2026-10-23

The user completed the full Docker production build and image export. PostgreSQL/Redis became healthy and migrations/storage initialization completed successfully. The API remained unhealthy and prevented the web service from starting. Its logs have been requested; this health summary does not identify an exception by itself.

Independent review found a definite startup defect: the route-schema helper targeted OpenAPI 3.0, emitting boolean exclusive numeric bounds that Fastify/AJV rejects. The rejection was reproduced with real Fastify in memory; a draft-7 equivalent registered successfully, accepted a positive size, and rejected zero. Runtime schema generation now targets JSON Schema draft 7, with a Jest regression test that compiles every actual request contract through Fastify.ready(). That full regression test awaits installed project dependencies. API startup now also closes infrastructure clients after failure, so Redis connections do not keep a failed HTTP startup alive. All 57 TypeScript files pass syntax checks after these changes. API logs and a rebuilt API container remain necessary to confirm the user's particular failure and recovery.

User logs subsequently confirmed `FST_ERR_SCH_VALIDATION_BUILD` for PUT `/photobooks/:id`: `exclusiveMinimum must be number` in element width. This matches the independently reproduced schema-target defect. Draft-7 schema generation is corrected in source; recovery still requires rebuilding/recreating the API and checking readiness.

## Web port follow-up — 2026-10-23

The user reports healthy API and worker containers, while the frontend is unhealthy. Resolved Compose configuration showed web inherited `PORT=4000` from the API dotenv document, but its published port and health check target 3000. Both local and production Compose now explicitly override the web service to `PORT=3000` while preserving inherited settings. Resolved configuration assertions pass for API=4000, web=3000, API rewrite target, Redis URL, and the correct local/production NODE_ENV. Existing images can use this environment correction without rebuilding; web container recreation and browser verification remain pending. Agent Docker daemon access remains denied, so the frontend logs were not observed directly.

## Readability cleanup — 2026-10-24

Reformatted 63 TypeScript/JavaScript files using the existing TypeScript formatting engine, with additional line breaks for imports, JSX attributes/children, object fields, signatures and long conditionals. Grouped variable declarations were split into individual statements while preserving initialization order. Test cases and route handlers now have visible separation. The stylesheet was expanded from dense one-line rules into indented rules/declarations. Prisma field alignment, Terraform layout, and simple YAML flow maps were cleaned up; applied migration files were excluded to preserve their recorded checksums.

Verification: emitted JavaScript AST equivalence checked for the source-formatting passes, with declaration grouping normalized for the declaration-splitting pass; CSS structure and comma-separated token groups preserved; Prisma schema tokens preserved; Terraform tokens and bootstrap heredoc preserved; YAML values preserved. All 57 TypeScript files pass syntax checks, six standalone tests pass, standalone domain/password strict checks pass, and both Compose configurations plus deployment shell syntax validate.

Added a pinned Prettier dependency, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, and `format` / `format:check` scripts, plus native Prisma/Terraform formatting commands. Prettier itself could not be installed or executed because package registry DNS remains unavailable. The local cleanup is not claimed to be Prettier-canonical, and `format:check` has not been marked passing or added as a CI gate. Run `pnpm install`, `pnpm format`, and `pnpm format:check` on a network-enabled checkout to apply and verify the exact configured style. Full application builds and browser tests were not rerun for this formatting task.

## Local object inspection — 2026-10-24

Enabled the local MinIO browser console with `--console-address :9001` and a `127.0.0.1:9001:9001` port mapping. Resolved Compose assertions confirm the console command/mapping, unchanged S3 API port 9000, and preservation of the existing `s3-data` volume. README documents the console login variable names and object key layout. The console has not been opened or runtime-verified from the agent environment; users must recreate the MinIO container to apply the configuration. Production Compose and private bucket access were not changed.
