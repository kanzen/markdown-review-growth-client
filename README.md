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
  secret: process.env.MARKDOWN_REVIEW_GROWTH_INGEST_SECRET, // the shared ingest credential
});

// inside the request that changes state — awaited, and its failure
// fails the request (write-before-success):
await ingestEvent({
  eventId,             // caller-generated uuid; retries reuse it
  name: "comment_created",
  userId,              // the pseudonymous internal user id
  occurredAt: new Date().toISOString(),
  properties: { pr_hash: prHash }, // typed per `name` — see below
});
```

No React, no browser entry point, no queue.

## The contract is typed per event

The ingest input is a **discriminated union on `name`**, one branch per
event the service accepts, each carrying that event's own `properties`
shape — inlined from the service's event catalog at build time. A payload
outside the catalog does not compile: an unknown name, a missing required
property, or an undeclared one.

```ts
import type {
  IngestEventInput,      // the whole union (envelope + name + properties)
  IngestEventName,       // "signup_completed" | "comment_created" | …
  IngestEventProperties, // IngestEventProperties<"comment_created"> → { pr_hash: string }
} from "@kanzen/markdown-review-growth-client";

// A producer derives its mirrored payload types from the package instead of
// keeping an independent copy:
type CommentCreated = IngestEventProperties<"comment_created">;
const properties: CommentCreated = { pr_hash: prHash }; // ok
// { }                                                    // error: pr_hash missing
// { pr_hash: prHash, repo: "o/r" }                       // error: undeclared key
```

`properties` is required on every branch (`{}` for events without any). The
service still validates every call at runtime against the same schema —
unknown names are rejected, undeclared keys stripped — but the contract you
program against is the type. Every catalog change is a service change, a new
release of this package, and then a version bump in the producer, in that
order.

The result is `{ persisted: boolean }` — `persisted: false` means the event
was already recorded (a retry or a latch duplicate), never an error. The
earlier `droppedProperties` field is gone with v2: a typed producer cannot
send undeclared keys, so there was nothing left to report.

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
