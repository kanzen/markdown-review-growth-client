// The consumer client for the markdown-review growth service
// (PRD FR-client-package, AD-client-package). Runtime code, but it only ever
// `import type`s from ../src, so no server code is bundled
// (SAD-client-package).
//
// SERVER-ONLY and deliberately the opposite of fire-and-forget: this is the
// mirror transport for account-state events (spec §7.3, decision 2026-08-11).
// Every call is awaited and THROWS on failure — the product request that
// carries a state change must not succeed until the growth write is
// acknowledged (PRD FR-event-ingestion, NFR-mirror-not-fail-soft). There is
// no queue, no retry-and-drop, no React, and no browser entry point; the
// caller owns retries, which are safe because ingestion is idempotent on the
// client-generated event ID (AD-ingest-idempotency).

import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "../src/server/router";

// The ingest contract, inferred from the deployed router so it cannot drift
// (SAD-client-package). The envelope's `eventId` is generated and owned by
// the caller: a retry must reuse the same id so the duplicate write stays a
// no-op (AD-ingest-idempotency).
export type IngestEventInput = inferRouterInputs<AppRouter>["ingestEvent"];
export type IngestEventResult = inferRouterOutputs<AppRouter>["ingestEvent"];

export type GrowthServiceClientOptions = {
  /**
   * The consumer product's app id, e.g. "markdown-review". A client-side
   * label only (decided 2026-08-13): it is not sent on ingest calls — the
   * route identifies its caller by the credential (AD-ingest-auth).
   */
  app: string;
  /**
   * The shared ingest credential (AD-ingest-auth), sent as a bearer token
   * on every call. Provisioned as `INGEST_SHARED_SECRET` on the service and
   * under the consumer's own env name on the product.
   */
  secret: string;
  /** Service origin; defaults to the production deployment. */
  serviceOrigin?: string;
  /**
   * Override for tests / non-standard runtimes. Also the seam that carries
   * hosting concerns — notably `x-vercel-protection-bypass` for SSO-gated
   * staging deployments (SAD-client-package).
   */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export type GrowthServiceClient = {
  /** The configured consumer app id (a label — never sent on the wire). */
  app: string;
  /**
   * Liveness check against the deployed service. Awaited; throws on any
   * failure.
   */
  ping: () => Promise<{ ok: true; service: "markdown-review-growth" }>;
  /**
   * Mirror one product-reported event (PRD FR-event-ingestion) — the
   * working surface of this package. Awaited within the product request
   * that carries the state change; throws on any failure
   * (write-before-success). `persisted: false` means the event was already
   * recorded — a retry or latch duplicate, not an error.
   */
  ingestEvent: (input: IngestEventInput) => Promise<IngestEventResult>;
  /** The underlying typed tRPC client, for procedures this wrapper doesn't cover. */
  trpc: TRPCClient<AppRouter>;
};

const PRODUCTION_ORIGIN = "https://markdown-review-growth.kanzen.sh";

/** Multi-instance factory (SAD-client-package); most consumers want `configureGrowthService` instead. */
export function createGrowthServiceClient(
  options: GrowthServiceClientOptions,
): GrowthServiceClient {
  const origin = (options.serviceOrigin ?? PRODUCTION_ORIGIN).replace(/\/$/, "");
  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${origin}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${options.secret}` }),
        fetch: options.fetch,
      }),
    ],
  });

  return {
    app: options.app,
    ping: () => trpc.ping.query(),
    ingestEvent: (input) => trpc.ingestEvent.mutate(input),
    trpc,
  };
}

let singleton: GrowthServiceClient | undefined;

/** Configure the singleton once, at app startup (SAD-client-package). */
export function configureGrowthService(options: GrowthServiceClientOptions): void {
  singleton = createGrowthServiceClient(options);
}

export function getGrowthServiceClient(): GrowthServiceClient {
  if (singleton === undefined) {
    throw new Error(
      "@kanzen/markdown-review-growth-client is not configured — call configureGrowthService() at startup",
    );
  }
  return singleton;
}

/** Bare-call form of `GrowthServiceClient.ping` on the configured singleton. */
export function ping(): Promise<{ ok: true; service: "markdown-review-growth" }> {
  return getGrowthServiceClient().ping();
}

/** Bare-call form of `GrowthServiceClient.ingestEvent` on the configured singleton. */
export function ingestEvent(input: IngestEventInput): Promise<IngestEventResult> {
  return getGrowthServiceClient().ingestEvent(input);
}
