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

import type { AppRouter } from "../src/server/router";

export type GrowthServiceClientOptions = {
  /**
   * The consumer product's app id, e.g. "markdown-review". Stored at
   * configure time; the ingest procedures of P-event-pipeline send it on
   * every call.
   */
  app: string;
  /** Service origin; defaults to the production deployment. */
  serviceOrigin?: string;
  /**
   * Override for tests / non-standard runtimes. Also the seam that carries
   * hosting concerns — notably `x-vercel-protection-bypass` for SSO-gated
   * staging deployments (SAD-client-package).
   */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  // How the product's server authenticates its calls is still open
  // (architecture OQ-consumer-auth); the credential option lands here with
  // the ingest procedures.
};

export type GrowthServiceClient = {
  /** The configured consumer app id, sent with every ingest call. */
  app: string;
  /**
   * Liveness check against the deployed service — the end-to-end proof of
   * the generated contract at P-scaffold. Awaited; throws on any failure.
   */
  ping: () => Promise<{ ok: true; service: "markdown-review-growth" }>;
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
        fetch: options.fetch,
      }),
    ],
  });

  return {
    app: options.app,
    ping: () => trpc.ping.query(),
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
