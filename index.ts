// @kanzen/markdown-review-growth-client — the consumer-facing contract of
// the markdown-review growth service (PRD FR-client-package,
// AD-client-package): the AppRouter type plus a ready-made server-only
// client. It is the mirror transport for account-state events, called only
// by the product's single tracking module (spec §7.3) — not a general event
// SDK for product code.
//
//   // once, at server startup:
//   configureGrowthService({ app: "markdown-review" });
//   // inside the request that changes state — awaited, and its failure
//   // fails the request (write-before-success, PRD FR-event-ingestion):
//   await ping();
//
// The ingest calls for the 11 product-reported mirrored events replace
// `ping` as the working surface in P-event-pipeline (KAN-712).

export type { AppRouter } from "../src/server/router";
export {
  configureGrowthService,
  createGrowthServiceClient,
  getGrowthServiceClient,
  ping,
  type GrowthServiceClient,
  type GrowthServiceClientOptions,
} from "./client";
