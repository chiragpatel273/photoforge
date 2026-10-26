# REST contracts

The browser prefix is `/api`; Fastify registers paths without that prefix. All requests/responses use JSON except direct storage uploads/downloads. Bodies are validated with shared Zod schemas and reflected as OpenAPI schemas. Live interactive documentation is `/api/docs/`, JSON is `/api/docs/json`. Successful responses return the entity or a paginated `{items,total,page,limit}` object.

Errors use `{ "error": { "message": "...", "requestId": "UUID" } }` with an `x-request-id` response header. 400 = invalid request; 401 = missing/expired session; 403 = rejected origin; 404 = missing/unowned resource; 409 = revision/idempotency/unique conflict; 422 = invalid asset/size/state; 429 = rate limit; 500 = sanitized internal failure. Request bodies are limited to 2 MB.

| Method and path                  | Contract                                                               | Access          |
| -------------------------------- | ---------------------------------------------------------------------- | --------------- |
| POST `/auth/register`            | `{name,email,password}`; password 12–128 characters                    | Public, limited |
| POST `/auth/login`               | `{email,password}`                                                     | Public, limited |
| POST `/auth/demo`                | Creates private 24-hour guest, sets cookie                             | Public, limited |
| GET `/auth/me`                   | `{id,name,email,isGuest}`                                              | Session         |
| POST `/auth/logout`              | Revokes existing sessions, clears cookie                               | Session         |
| GET `/templates`                 | Seeded templates, cached 5 minutes                                     | Public          |
| GET `/photobooks`                | `?page=1&limit=12&q=...`; limit 1–50                                   | Session, owned  |
| POST `/photobooks`               | `{title,templateId}`                                                   | Session         |
| GET `/photobooks/:id`            | Full document and revision                                             | Owner           |
| PUT `/photobooks/:id`            | `{title,revision,document}`                                            | Owner           |
| DELETE `/photobooks/:id`         | Deletes working records; order snapshots survive                       | Owner           |
| POST `/photobooks/:id/duplicate` | Deep-copy pages/elements, remap asset IDs, share immutable object keys | Owner           |
| GET `/photobooks/:id/images`     | Up to 200 assets, signed derivative URLs                               | Owner           |
| POST `/photobooks/:id/images`    | `{filename,mime,size}` → `{asset,uploadUrl}`                           | Owner           |
| POST `/images/:id/complete`      | Validate upload metadata; enqueue/retry processing                     | Owner           |
| POST `/photobooks/:id/exports`   | Enqueue/reuse saved revision → 202 ExportJob                           | Owner           |
| GET `/exports/:id`               | Status, progress, safe error, optional `downloadUrl`                   | Owner           |
| POST `/orders`                   | `{bookId,size,pageCount,idempotencyKey}` → mock order                  | Owner           |
| GET `/orders`                    | `?page=1&limit=12`                                                     | Session, owned  |
| GET `/health`                    | Process liveness                                                       | Public          |
| GET `/ready`                     | DB and Redis readiness                                                 | Public          |

Images progress `UPLOADING → QUEUED → PROCESSING → READY` or `FAILED`; export jobs use the same states without UPLOADING. Automatic retries may return PROCESSING to QUEUED. Download/preview URLs expire after 900 seconds; request fresh metadata to renew. Upload PUT URLs expire after 300 seconds.

## Document v1

```json
{
  "schemaVersion": 1,
  "widthMm": 210,
  "heightMm": 210,
  "bleedMm": 3,
  "pages": [
    {
      "id": "31b33ecf-9288-482c-83db-5e7b6c9a0670",
      "background": "#ffffff",
      "elements": [
        {
          "id": "dbd8f331-fd24-46b8-b353-11d0aa38a430",
          "type": "text",
          "x": 100,
          "y": 100,
          "width": 800,
          "height": 100,
          "rotation": 0,
          "text": "A memory worth keeping",
          "fontSize": 40,
          "fontFamily": "Helvetica",
          "color": "#26392e",
          "align": "center"
        }
      ]
    }
  ]
}
```

Image elements replace text properties with `assetId` and normalized `crop:{x,y,width,height}`. Crop bounds must fit within the image. Placeholder elements contain a label and the same geometry and are omitted in print. All element/page IDs are UUIDs and unique across the document. There are 1–80 pages and at most 100 elements per page. Width/height are 100–420 mm, bleed 0–5 mm, colors use six-digit hex, and unsupported PDF text scripts fail validation instead of failing silently during export.

The book is a 1000-unit-wide logical canvas. Physical height determines logical page height. Element rotation is clockwise degrees around the top-left origin, matching Konva coordinates. All image references must be READY and belong to the same owner/book.

## Pricing

USD prices include up to 20 pages: square 210×210 mm = $29, landscape 280×210 mm = $35, large 300×300 mm = $49. Each additional page is $1.25, up to 80 pages. Page count must match the saved book and dimensions must match the chosen format. Shipping and tax are not calculated because checkout is simulated.

Never retry checkout with a newly generated idempotency key after a network ambiguity. Reuse the original key; the API returns the previously created order. An identical key with differing order parameters returns a conflict.
