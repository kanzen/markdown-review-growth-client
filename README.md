# @kanzen/markdown-review-growth-client

Server-only client and contract types for the **markdown-review growth
service** consumer API (`markdown-review-growth.kanzen.sh`). It is the mirror
transport for the account-state events the product reports to the growth
service — called only by the product's single tracking module, not a general
event SDK.

Delivery is **write-before-success**: every call is awaited and throws on
failure, so the product request carrying a state change succeeds only once
the growth write is acknowledged. Retries are the caller's, and are safe —
ingestion is idempotent on a client-generated event ID.

```ts
// once, at server startup:
configureGrowthService({
  app: "markdown-review", // client-side label — never sent on the wire
  secret: process.env.GROWTH_INGEST_SECRET, // the shared ingest credential
});

// inside the request that changes state — awaited, and its failure
// fails the request (write-before-success):
await ingestEvent({
  eventId,             // caller-generated uuid; retries reuse it
  name: "comment_created",
  userId,              // the pseudonymous internal user id
  occurredAt: new Date().toISOString(),
  properties: { pr_hash: prHash },
});
```

No React, no browser entry point, no queue.

## Development

This repo is a standalone git repository **nested inside a checkout of the
service repo** (`markdown-review-growth-nextjs`) — the build imports the
service's `../src`, so building and testing only work from that nesting:

```sh
bun run build        # dts rollup + bundle + consumer-view typecheck
bun run test:nested  # bun test against the real router
```

`dist/` is committed: CI on this repo can only publish the committed
artifact, never rebuild it. Rebuild and re-test from the service checkout
before pushing to `main`.
