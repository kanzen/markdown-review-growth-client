// @kanzen/markdown-review-growth-client — the consumer-facing contract of the
// kanzen growth service (C-growth-client, AD-trpc, AD-nested-client-repo): the
// AppRouter and catalog types plus a ready-made fire-and-forget client, so
// consumers just call `reportEvent(...)` at their touchpoints.
//
//   // once, at app startup:
//   configureGrowthService({
//     app: "markdown-review",
//     getSessionToken: () => session.getToken(),
//   });
//   // anywhere — including outside React, and after unmount:
//   reportEvent("section_reviewed", { numberOfSections: 3 });
//
// The report call returns synchronously and never throws: if the growth
// service is slow, erroring, or entirely down, the product behaves exactly as
// if it were healthy (PRD NFR-consumer-isolation).

export type { AppRouter } from "../src/server/router";
export type { AnonymousEventName, EventName, EventProperties } from "../src/lib/catalog";
export {
  configureGrowthService,
  createGrowthServiceClient,
  flush,
  getGrowthServiceClient,
  reportEvent,
  type GrowthServiceClient,
  type GrowthServiceClientOptions,
} from "./client";
