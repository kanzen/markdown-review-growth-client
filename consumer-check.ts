// Build-time consumer-view check (runs in `bun run build` after bundling):
// typechecks the PUBLISHED artifact exactly as a consumer would import it —
// self-contained declarations with the reachable public closure only
// (SAD-client-package). Excluded from the root tsconfig (depends on dist/
// existing). The `@ts-expect-error` assertions fail the build if the shipped
// surface ever grows or shrinks unexpectedly, because tsc errors on an
// unused expect-error directive.

import {
  configureGrowthService,
  createGrowthServiceClient,
  getGrowthServiceClient,
  ingestEvent,
  ping,
  type AppRouter,
  type GrowthServiceClient,
  type GrowthServiceClientOptions,
  type IngestEventInput,
  type IngestEventName,
  type IngestEventProperties,
  type IngestEventResult,
} from "./dist/index";
import type { inferRouterOutputs } from "@trpc/server";

type PingOutput = inferRouterOutputs<AppRouter>["ping"];
const output: PingOutput = { ok: true, service: "markdown-review-growth" };

// The everyday surface: configure once at startup, then bare calls.
configureGrowthService({ app: "markdown-review", secret: "from-env" });
const pinged: Promise<PingOutput> = ping();
const ingested: Promise<IngestEventResult> = ingestEvent({
  eventId: "7f0d34a2-6f2e-4a2b-9a44-0f6de1b2c3d4",
  name: "comment_created",
  userId: "user_123",
  occurredAt: "2026-08-13T10:00:00.000Z",
  properties: { pr_hash: "abc" },
});

// @ts-expect-error — the secret is required (AD-ingest-auth): configuring without it must not compile
configureGrowthService({ app: "markdown-review" });

const input: IngestEventInput = {
  eventId: "7f0d34a2-6f2e-4a2b-9a44-0f6de1b2c3d4",
  name: "signup_completed",
  userId: "user_123",
  occurredAt: "2026-08-13T10:00:00.000Z",
  properties: { acquisition_source: "show-hn" },
};

// The per-event contract (KAN-715): `properties` is typed by `name`, and the
// helper types let a producer derive its payload types from this package.
const name: IngestEventName = "comment_created";
const commentProperties: IngestEventProperties<"comment_created"> = { pr_hash: "abc" };
const bareProperties: IngestEventProperties<"trial_started"> = {};

// @ts-expect-error — a name outside the service catalog must not compile
const unknownName: IngestEventName = "landing_viewed";

// @ts-expect-error — `properties` is required on every branch
const missingProperties: IngestEventInput = {
  eventId: "7f0d34a2-6f2e-4a2b-9a44-0f6de1b2c3d4",
  name: "comment_created",
  userId: "user_123",
  occurredAt: "2026-08-13T10:00:00.000Z",
};

// @ts-expect-error — `pr_hash` is required for comment_created
const wrongProperties: IngestEventInput = {
  eventId: "7f0d34a2-6f2e-4a2b-9a44-0f6de1b2c3d4",
  name: "comment_created",
  userId: "user_123",
  occurredAt: "2026-08-13T10:00:00.000Z",
  properties: {},
};

// @ts-expect-error — the result no longer reports droppedProperties (v2)
const dropped: IngestEventResult = { persisted: true, droppedProperties: [] };
const result: IngestEventResult = { persisted: false };

const options: GrowthServiceClientOptions = {
  app: "markdown-review",
  secret: "from-env",
  serviceOrigin: "https://markdown-review-growth.kanzen.sh",
};
const client: GrowthServiceClient = createGrowthServiceClient(options);
const configured: GrowthServiceClient = getGrowthServiceClient();

// @ts-expect-error — a procedure outside the router must not exist on the escape hatch
client.trpc.definitelyNotAProcedure;

void output;
void pinged;
void ingested;
void input;
void name;
void commentProperties;
void bareProperties;
void unknownName;
void missingProperties;
void wrongProperties;
void dropped;
void result;
void client;
void configured;
