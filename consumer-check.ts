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
  ping,
  type AppRouter,
  type GrowthServiceClient,
  type GrowthServiceClientOptions,
} from "./dist/index";
import type { inferRouterOutputs } from "@trpc/server";

type PingOutput = inferRouterOutputs<AppRouter>["ping"];
const output: PingOutput = { ok: true, service: "markdown-review-growth" };

// The everyday surface: configure once at startup, then bare calls.
configureGrowthService({ app: "markdown-review" });
const pinged: Promise<PingOutput> = ping();

const options: GrowthServiceClientOptions = {
  app: "markdown-review",
  serviceOrigin: "https://markdown-review-growth.kanzen.sh",
};
const client: GrowthServiceClient = createGrowthServiceClient(options);
const configured: GrowthServiceClient = getGrowthServiceClient();

// @ts-expect-error — no ingest surface yet: it lands in P-event-pipeline (KAN-712)
client.reportEvent;

// @ts-expect-error — a procedure outside the router must not exist on the escape hatch
client.trpc.definitelyNotAProcedure;

void output;
void pinged;
void client;
void configured;
