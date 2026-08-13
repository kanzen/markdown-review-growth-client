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
  name: "comment_created",
  userId: "user_123",
  occurredAt: "2026-08-13T10:00:00.000Z",
};

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
void client;
void configured;
