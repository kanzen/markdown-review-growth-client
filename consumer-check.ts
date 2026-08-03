// Build-time consumer-view check (runs in `bun run build` after bundling):
// typechecks the PUBLISHED artifact exactly as a consumer would import it —
// self-contained declarations, versioned procedures inferring, unversioned
// paths absent. Excluded from the root tsconfig (depends on dist/ existing).
//
// This is the file that makes "a bad event name fails the consumer's build"
// (PRD FR-client-package) a checked claim rather than an intention: the
// `@ts-expect-error` assertions below fail the build if the catalog ever stops
// rejecting them, because tsc errors on an unused expect-error directive.

import {
  configureGrowthService,
  createGrowthServiceClient,
  flush,
  reportEvent,
  type AnonymousEventName,
  type AppRouter,
  type EventName,
  type EventProperties,
  type GrowthServiceClient,
} from "./dist/index";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

type Input = inferRouterInputs<AppRouter>["v1"]["reportEvent"];
type Output = inferRouterOutputs<AppRouter>["v1"]["reportEvent"];

const input: Input = {
  app: "markdown-review",
  events: [{ name: "section_reviewed", properties: { numberOfSections: 3 } }],
};
const output: Output = { accepted: 1 };

const anonymousInput: inferRouterInputs<AppRouter>["v1"]["reportAnonymousEvent"] = {
  app: "markdown-review",
  events: [{ name: "landing_viewed", properties: { url: "https://kanzen.sh/" } }],
  visitorId: "6f1a9c5e-6f9a-4f2e-9a3f-2b1c4d5e6f70",
};

configureGrowthService({ app: "markdown-review", getSessionToken: () => null });

// The everyday surface: configure once, then report from anywhere.
reportEvent("section_reviewed", { numberOfSections: 3 });
reportEvent("real_pr_opened", { repositoryVisibility: "private" });
reportEvent("landing_viewed", { url: "https://markdown-review.kanzen.sh/" });
const drained: Promise<void> = flush();

const client: GrowthServiceClient = createGrowthServiceClient({
  app: "markdown-review",
  getSessionToken: () => null,
  getVisitorId: () => null,
});

// Property shapes are per event, so the wrong shape is a consumer build error.
const sectionProperties: EventProperties<"section_reviewed"> = { numberOfSections: 1 };
const landing: EventName = "landing_viewed";
const anonymous: AnonymousEventName = "landing_viewed";

// @ts-expect-error — an event name outside the closed catalog must not compile
reportEvent("definitely_not_a_catalog_event", {});

// @ts-expect-error — `url` is required on landing_viewed
reportEvent("landing_viewed", {});

// @ts-expect-error — repositoryVisibility is an enum, not free text
reportEvent("real_pr_opened", { repositoryVisibility: "internal" });

// @ts-expect-error — an attributed event is not an AnonymousEventName
const notAnonymous: AnonymousEventName = "section_reviewed";

// @ts-expect-error — unversioned procedures must not exist on the type
type _Missing = inferRouterOutputs<AppRouter>["reportEvent"];

void input;
void output;
void anonymousInput;
void drained;
void client;
void sectionProperties;
void landing;
void anonymous;
void notAnonymous;
