# Technical architecture

## Responsibilities

Next.js serves the static marketing shell and interactive application routes. React Konva is dynamically imported with server rendering disabled for the canvas; the rest of the application uses the App Router normally. Authenticated server state is fetched after session verification. Zustand owns editable document snapshots, selection, active page, history, and save sequencing. TanStack Query owns fetched entities, polling and cancellation. No Base64 images are kept in document state.

Fastify owns validation, authentication, authorization, API responses and business decisions. Modules register routes using an explicitly injected context. `BooksService` centralizes book access, referenced-asset validation, optimistic concurrency and transactional page persistence. Infrastructure adapters supply Prisma, Redis, queues and S3. `PaymentGateway` is a small extension point; its only implementation deliberately records mock confirmation. A real provider must introduce pending/paid state and authenticated webhook processing before changing this contract.

The worker role owns CPU/memory-intensive Sharp work and pdf-lib generation. Image concurrency is two jobs, PDF concurrency one. Sharp native thread parallelism is restricted to one with a 64 MB cache. Large image buffers still require memory headroom; measure RSS under realistic workloads before sizing production.

## Storage choices

**PostgreSQL** provides transactional ownership relationships, order records and predictable indexed listing. The editable document lives in `Photobook.document` JSONB. `PhotobookPage` mirrors page content/order in the same save transaction, giving a future page-level query/migration path without making the editor reconstruct its document through many requests. This deliberately trades storage duplication for simple atomic saves; do not update either representation independently.

**Redis** provides read-heavy template caching and distributed rate limits, as well as queue state. Cached templates have a five-minute TTL and a versioned key. A template seed/update should delete `templates:v1` (the seed script does this) so later reads see the change. User-specific book responses are not globally cached. Redis uses append-only persistence and `noeviction`; do not evict queue keys under memory pressure.

**BullMQ** provides independently scalable consumers, bounded exponential retries, stalled-job detection and retained failed jobs. It avoids extending HTTP lifetimes while processing images/exports. Each job uses a stable database UUID as its BullMQ ID. Processors return early for already-ready records and write deterministic output keys. This is idempotent, at-least-once processing, not an exactly-once claim.

**S3** stores uploads, validated originals, optimized editor images, thumbnails and PDFs. PostgreSQL stores metadata/keys, not image blobs. Browsers receive short-lived URLs after an ownership check. A local S3-compatible MinIO service exercises the same adapter boundary without requiring AWS credentials.

**Separate workers** isolate CPU load from API latency. The first deployment keeps roles on a single EC2 host for cost/operational simplicity; the container boundary supports moving workers onto separate hosts when measured queue lag requires it.

## Data model

| Model         | Relationships and invariants                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| User          | Unique normalized email, scrypt hash or expiring guest identity, session revocation version             |
| Template      | Stable category/name and validated seed document                                                        |
| Photobook     | Owned by one user, references template, document JSON, monotonically increasing revision                |
| PhotobookPage | Belongs to a book; UUID identity and unique book/position pair                                          |
| ImageAsset    | User/book ownership, declared type/size, private storage keys, processing status/dimensions             |
| ExportJob     | Book ownership through relation, unique book/revision, immutable document snapshot, status/progress/key |
| Order         | Owner, unique idempotency key, server-computed integer total, explicit mock status                      |
| OrderItem     | Immutable title/format/page-count/document snapshot; survives book deletion with nullable book relation |

User/date indexes support dashboard/order pagination; image owner/book/status supports authorization and processing queries. Export status/date supports queue reconciliation. Foreign keys cascade private working data; order items detach from deleted books.

## Save protocol

A client saves `{title, revision, document}`. The service checks ownership and that all referenced images belong to that book/user and are READY. In one transaction it conditionally updates the book at the submitted revision, increments the revision, replaces page rows and returns the updated record. A stale revision yields HTTP 409. The client acknowledges only the mutation sequence it sent; changes made while that request was in flight remain dirty and are saved in a subsequent iteration.

Undo/redo restores editable content, never rolls back the server revision. History holds at most 60 snapshots and avoids embedding image bytes. This is suitable for an MVP; patch-based history would reduce memory for very large books.

## Upload protocol

1. Authenticated client requests an upload reservation with name/type/size.
2. API checks book ownership, quotas and the allowlist, reserves a private key and signs a five-minute PUT for the declared content type/length.
3. Browser uploads directly to storage, then calls completion.
4. API validates stored size/type and records QUEUED before best-effort enqueue.
5. Worker rechecks metadata, decodes real bytes with a pixel cap, checks format/animation, rotates and strips metadata, and creates derivatives.
6. Worker writes a validated original under a server-only key and atomically updates the asset metadata to READY. Export never trusts the browser-writable upload key after this transition.

Completion is retryable. Oversized, corrupt and mismatched objects do not become READY. A presigned PUT remains a bearer capability until expiration, so a server-only canonical original is necessary even after successful processing.

## Queue recovery

The database record is the durable intent to process. If enqueue fails after the DB write, a ten-second reconciler finds QUEUED/PROCESSING records and attempts a deterministic enqueue. Redis retains active/delayed/completed IDs to collapse duplicates. If Redis loses queue data, unfinished database records can be enqueued again. If a failed-event status update was interrupted, reconciliation recovers FAILED from the retained BullMQ dead letter.

After four failed attempts, jobs remain in BullMQ's failed set and the database exposes FAILED. A user retry clears that failed queue entry and re-enqueues the same logical job. Completed jobs are retained for a day (up to 1000); failed jobs require operational review/cleanup. This is a dead-letter state in the original queue, not a second failure queue.

## Export and print

An export snapshots the last saved revision. All images are loaded through owner/book checks. Workers orient source images, apply normalized crops, flatten transparency against white, embed JPEGs, and draw standard PDF text with wrapping/alignment/rotation. Page dimensions use millimetres converted to PDF points. Media/BleedBox includes the selected bleed, TrimBox identifies the requested finished size. Page background extends into bleed; photos placed only inside trim do not automatically extend into bleed. Empty template guides do not render.

Client DPI warnings are estimates based on original pixel width, crop width and physical placement. There is no full preflight engine, bleed-image extension, crop marks, CMYK conversion, ICC profile embedding, PDF/X certification, arbitrary Unicode font shaping, or printer certification. Helvetica/Times/Courier map to standard browser equivalents; exact line breaking may differ between browser fonts and PDF standard fonts. Inspect a real output before production printing.

## Evolution

100,000 requests/day averages about 1.16 requests/second; burst shape, query cost, image sizes and job concurrency determine actual capacity. This is a target context, not evidence of achieved load. Scale workers based on queue depth/age, then add API instances behind an ALB, move Redis to ElastiCache with TLS and failover, and enable Multi-AZ RDS when availability warrants its cost. Add read replicas only for measured read bottlenecks; ownership checks and writes remain on the primary. Replace offset pagination with a date/UUID cursor if deep traversal becomes costly.

Queue semantics references: [BullMQ job identity](https://docs.bullmq.io/guide/jobs/job-ids) and [idempotent processors](https://docs.bullmq.io/patterns/idempotent-jobs). Retaining an ID only deduplicates while that queue record exists; database READY checks remain necessary after queue cleanup.
