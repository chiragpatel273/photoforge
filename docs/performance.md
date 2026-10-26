# Performance: targets and evidence

## Implemented mechanisms

Indexed owner/date pagination bounds dashboard/history reads. Images and PDFs are stored outside PostgreSQL. Template reads use a versioned Redis cache with a five-minute TTL; seed updates invalidate it. Rate limits are Redis-backed. Original uploads go directly to storage rather than through the API. Workers generate 360 px library thumbnails and 3200 px canvas derivatives; exports use canonical source images. Konva is dynamically loaded, canvas work uses a single layer, and only the active page is rendered. Assets refresh their signed URLs before expiry. Search queries support fetch cancellation. Autosave is debounced and background work is queued. Shutdown closes workers before infrastructure clients.

Canvas selection updates currently subscribe to the full Zustand store; more granular selectors/memoization and patch-based history are sensible next steps after profiling large books. Thumbnail-strip previews currently show text/photo indicators rather than bitmap canvas captures. Computationally expensive image/PDF operations run in server workers; a browser Web Worker was not introduced without a client CPU bottleneck.

## Load test

`infrastructure/load.k6.js` exercises health, cached templates, and an authenticated paginated dashboard. It ramps from 5 to 10 virtual users and back down, with pacing to respect the default 200-request/minute per-IP rate limit. Use a disposable session and an environment you own:

```bash
BASE_URL=https://your-test-host/api \
SESSION_COOKIE='pf_session=YOUR_DISPOSABLE_TEST_COOKIE' \
k6 run infrastructure/load.k6.js
```

Thresholds are proposed acceptance goals: p95 under 500 ms and request failures under 1%. This is not a full upload/PDF performance scenario. Test image processing separately with varied resolution, orientation, transparency and entropy; observe worker RSS, CPU, queue age and S3 latency.

## Measured results

No HTTP or job-throughput benchmark has been run. This environment cannot install missing packages or connect to Docker. There is no production traffic measurement, no verified capacity claim, and no claim that 100,000 daily requests have been exercised.

Record machine/container limits, region, database size, dataset, cache state, concurrency, latency percentiles, throughput, errors, timeouts, worker memory and job lag alongside every future benchmark. Preserve raw k6 output. Compare cold and warm cache behavior and include authorization rather than measuring only public health endpoints.

## Scaling target

100,000 daily requests is an architecture target. Before scaling, measure DB connection use, query plans, API latency/error rate, queue lag and upload/export completion latency. Increase API/worker replicas independently, introduce an ALB and managed Redis, use Multi-AZ RDS for availability, and add read replicas only for a measured need. Cap per-process database pools and native image concurrency to avoid overwhelming RDS/host memory.
