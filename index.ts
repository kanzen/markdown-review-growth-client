// @kanzen/markdown-review-growth-client — the consumer-facing contract of
// the markdown-review growth service (PRD FR-client-package,
// AD-client-package): the AppRouter type plus a ready-made server-only
// client. It is the mirror transport for account-state events, called only
// by the product's single tracking module (spec §7.3) — not a general event
// SDK for product code.
//
//   // once, at server startup:
//   configureGrowthService({
//     app: "markdown-review",
//     secret: env.MARKDOWN_REVIEW_GROWTH_INGEST_SECRET,
//   });
//   // inside the request that changes state — awaited, and its failure
//   // fails the request (write-before-success, PRD FR-event-ingestion):
//   await ingestEvent({
//     eventId,             // caller-generated uuid; retries reuse it
//     name: "comment_created",
//     userId,              // the pseudonymous internal user id
//     occurredAt: new Date().toISOString(),
//     properties: { pr_hash: prHash }, // typed per `name` — the service
//   });                                // catalog is the contract (KAN-715)

export type { AppRouter } from "../src/server/router";
export {
  configureGrowthService,
  createGrowthServiceClient,
  getGrowthServiceClient,
  ingestEvent,
  ping,
  type GrowthServiceClient,
  type GrowthServiceClientOptions,
  type IngestEventInput,
  type IngestEventName,
  type IngestEventProperties,
  type IngestEventResult,
} from "./client";
