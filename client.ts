// C-growth-client (PRD FR-client-package, AD-nested-client-repo): the
// ready-made consumer client for the kanzen growth service. Runtime code, but
// it only ever `import type`s from ../src, so no server code — and critically
// no zod — is bundled (AD-trpc: zod is a types-only dependency here).
//
// Everything in this file exists to serve PRD NFR-consumer-isolation: if the
// growth service is slow, erroring, or entirely gone, the consuming product
// must behave exactly as if it were healthy. So `reportEvent` enqueues and
// returns SYNCHRONOUSLY, delivery happens in the background, and failures
// retry a bounded number of times and are then DROPPED SILENTLY. Growth is
// instrumentation: it is allowed to lose events, and never allowed to cost a
// review (AD-fire-and-forget).

import { createTRPCClient, httpLink, type TRPCClient } from "@trpc/client";

import type { AnonymousEventName, EventName, EventProperties } from "../src/lib/catalog";
import type { AppRouter } from "../src/server/router";

export type GrowthServiceClientOptions = {
  /** The consumer product's app id, e.g. "markdown-review". Sent on every call. */
  app: string;
  /**
   * Clerk session JWT for the shared kanzen instance (cross-origin auth is
   * Bearer, never cookies). Return null when signed out — events that require
   * attribution are then dropped rather than sent unattributed, and
   * anonymous-eligible events fall back to the public procedure.
   *
   * A token, not a user id: a client-supplied user id is trivially forged,
   * which would let anyone start a stranger's trial or push their PQL score
   * past the threshold. The JWT is proof, verified server-side
   * (PRD NFR-event-integrity, AD-session-token).
   */
  getSessionToken: () => Promise<string | null> | string | null;
  /**
   * The anonymous visitor id for pre-sign-in events (AD-visitor-identity).
   * Must be a UUID — the public procedure enforces it, because the id is the
   * primary key of the table that stages first touch.
   *
   * Return null when there is none (a consent-decliner, or before the id is
   * minted): anonymous events are then dropped, which costs cross-visit
   * attribution but never blocks the product. Minting and persisting the id is
   * C-anonymous-identity / KAN-717, not this scaffold's job.
   */
  getVisitorId?: () => string | null;
  /** Service origin; defaults to the production deployment. */
  serviceOrigin?: string;
  /**
   * Override for tests / non-browser runtimes. Also the seam that carries
   * hosting concerns — notably `x-vercel-protection-bypass` for SSO-gated
   * staging deployments (AD-consumer-cors).
   */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export type GrowthServiceClient = {
  /**
   * Report a catalog event. Returns immediately, always — it never throws,
   * never rejects, and never blocks a render, an interaction, or unload.
   *
   * Which procedure carries the event is decided at flush time from the
   * session, not by the caller (see `partition`).
   */
  reportEvent: <Name extends EventName>(name: Name, properties: EventProperties<Name>) => void;
  /**
   * Deliver everything queued now, resolving once each batch has been
   * delivered or dropped. Never rejects.
   *
   * Exposed for tests and for consumers that want a best-effort drain at a
   * known moment; ordinary use needs no flush call at all.
   */
  flush: () => Promise<void>;
  /** The underlying typed tRPC client, for procedures this wrapper doesn't cover. */
  trpc: TRPCClient<AppRouter>;
};

const PRODUCTION_ORIGIN = "https://growth.kanzen.sh";

/** The server caps a batch at 50 events (`reportEventInput`). */
const MAX_EVENTS_PER_BATCH = 50;

/**
 * Hard ceiling on unsent events. A product that reports while the service is
 * unreachable must not grow this queue without bound — an instrumentation
 * client is never allowed to become a memory leak in someone else's app
 * (PRD NFR-consumer-isolation).
 */
const MAX_QUEUED_EVENTS = 500;

/** Attempts per batch before the batch is dropped for good. */
const MAX_ATTEMPTS = 3;

/** Base backoff between attempts; doubles each time. */
const RETRY_BASE_DELAY_MS = 200;

/** How long events accumulate before a flush, so bursts travel as one request. */
const FLUSH_DELAY_MS = 1000;

type QueuedEvent = {
  name: EventName;
  properties: Record<string, unknown>;
};

/**
 * Which catalog events may travel on the PUBLIC procedure, as a total map over
 * `AnonymousEventName`.
 *
 * Deliberately a duplicated literal rather than an import of the catalog's
 * `isAnonymousEvent`: that is a runtime *value* from a module that imports zod,
 * so importing it would pull zod's whole schema graph into the consumer's
 * runtime bundle, which AD-trpc forbids (zod is types-only here).
 *
 * It cannot drift, which is the point of the `Record` rather than an array: if
 * the catalog gains an anonymous event this object stops compiling for a
 * missing key, and if one is removed or renamed it stops compiling for an
 * excess one. The type is the source of truth; this is only its runtime shadow.
 */
const ANONYMOUS_EVENTS: Record<AnonymousEventName, true> = {
  landing_viewed: true,
  demo_opened: true,
  public_pr_loaded: true,
  shared_link_opened: true,
};

function isAnonymousEligible(name: EventName): boolean {
  return Object.hasOwn(ANONYMOUS_EVENTS, name);
}

/**
 * Whether a failed attempt is worth repeating.
 *
 * A rejected batch is usually permanent, not transient: an unknown event name,
 * a bad property, or a service-emitted event a consumer may not report are all
 * 400s that will fail identically forever (FR-event-catalog). Retrying those
 * burns the product's network for nothing, so only transient conditions —
 * network failure, timeout, rate limit, server error — are retried.
 */
function isRetryable(error: unknown): boolean {
  const status = (error as { data?: { httpStatus?: unknown } } | null | undefined)?.data?.httpStatus;
  // No HTTP status at all means the request never got an answer — offline, DNS
  // failure, CORS, an aborted connection. Those are exactly the transient ones.
  if (typeof status !== "number") return true;
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export function createGrowthServiceClient(options: GrowthServiceClientOptions): GrowthServiceClient {
  const origin = (options.serviceOrigin ?? PRODUCTION_ORIGIN).replace(/\/$/, "");
  const trpc = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${origin}/api/trpc`,
        fetch: options.fetch,
        // The anonymous procedure is public, so a missing token is not an
        // error here — it simply sends no Authorization header. A token source
        // that THROWS is treated the same way: Clerk not being loaded yet is a
        // signed-out request, not a reason to fail the product's call.
        headers: async () => {
          try {
            const token = await options.getSessionToken();
            return token === null ? {} : { Authorization: `Bearer ${token}` };
          } catch {
            return {};
          }
        },
      }),
    ],
  });

  let queue: QueuedEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Serialises flushes: a flush triggered while one is in flight waits for it
  // rather than racing it, so batches cannot interleave or double-send.
  let inFlight: Promise<void> = Promise.resolve();

  function schedule(): void {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, FLUSH_DELAY_MS);
    // Node/bun keep the process alive for a pending timer; a background flush
    // must never be the reason a CLI or a test runner refuses to exit. Cast
    // because `setTimeout` resolves to the DOM's (a number) or node's (a
    // Timeout) depending on the consumer's lib config, and only one has unref.
    (timer as { unref?: () => void } | null)?.unref?.();
  }

  async function send(events: readonly QueuedEvent[], visitorId: string | null): Promise<void> {
    const payload = events.map((event) => ({ name: event.name, properties: event.properties }));
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        if (visitorId === null) {
          await trpc.v1.reportEvent.mutate({ app: options.app, events: payload });
        } else {
          await trpc.v1.reportAnonymousEvent.mutate({
            app: options.app,
            events: payload,
            visitorId,
          });
        }
        return;
      } catch (error) {
        if (attempt === MAX_ATTEMPTS || !isRetryable(error)) return; // dropped, silently
        await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }

  /**
   * Split a drained queue by the procedure that may carry each event.
   *
   * With a session everything goes on the protected procedure, including
   * anonymous-eligible events — the server records those against the verified
   * session, which is strictly better data than reporting them anonymously.
   * Without one, only anonymous-eligible events can travel at all: an
   * attributed event with no session has no account to belong to, so it is
   * dropped rather than sent to be rejected (PRD NFR-event-integrity).
   */
  function partition(
    events: readonly QueuedEvent[],
    token: string | null,
  ): { attributed: QueuedEvent[]; anonymous: QueuedEvent[] } {
    if (token !== null) return { attributed: [...events], anonymous: [] };
    return { attributed: [], anonymous: events.filter((event) => isAnonymousEligible(event.name)) };
  }

  async function drain(): Promise<void> {
    while (queue.length > 0) {
      const draining = queue;
      queue = [];

      // Read both identities once per drain rather than per batch: the token is
      // what decides the routing, so it must not change halfway through one.
      let token: string | null = null;
      try {
        token = await options.getSessionToken();
      } catch {
        token = null; // a throwing token source is a signed-out client, not a crash
      }
      let visitorId: string | null = null;
      try {
        visitorId = options.getVisitorId?.() ?? null;
      } catch {
        visitorId = null;
      }

      const { attributed, anonymous } = partition(draining, token);

      for (const batch of chunk(attributed, MAX_EVENTS_PER_BATCH)) {
        await send(batch, null);
      }
      // No visitor id means nothing identifies these events, so there is
      // nothing to report — the ordinary case for a consent-decliner.
      if (visitorId !== null) {
        for (const batch of chunk(anonymous, MAX_EVENTS_PER_BATCH)) {
          await send(batch, visitorId);
        }
      }
    }
  }

  function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    // Chained, and each link swallows its own failure: `flush()` is part of the
    // fire-and-forget contract and must never reject into consumer code.
    inFlight = inFlight.then(drain, () => undefined).catch(() => undefined);
    return inFlight;
  }

  return {
    trpc,
    flush,
    reportEvent: (name, properties) => {
      // Belt and braces: the contract is that this function cannot throw, so
      // nothing inside it is allowed to escape — not even a caller passing
      // something exotic, or an exhausted-memory push.
      try {
        if (queue.length >= MAX_QUEUED_EVENTS) return;
        queue.push({ name, properties: properties as Record<string, unknown> });
        schedule();
      } catch {
        // Deliberately empty: a growth event is never worth an exception in the
        // product (PRD NFR-consumer-isolation).
      }
    },
  };
}

// ---- Singleton surface: configure once at app startup, then import and call
// the functions directly anywhere — including outside React and after unmount,
// which is exactly where events fire from.
//
//   configureGrowthService({ app: "markdown-review", getSessionToken: … });
//   reportEvent("section_reviewed", { numberOfSections: 3 });

let singleton: GrowthServiceClient | null = null;

export function configureGrowthService(options: GrowthServiceClientOptions): void {
  singleton = createGrowthServiceClient(options);

  // Best-effort drain when the page goes away, so a burst reported in the last
  // second of a visit is not lost to the batch window. `pagehide` fires on the
  // bfcache path where `unload` does not; the flush is deliberately NOT awaited
  // — nothing here may delay a navigation (PRD NFR-consumer-isolation).
  //
  // Registered only for the singleton: `createGrowthServiceClient` serves tests
  // and multi-instance use, and attaching a listener per instance would leak.
  if (typeof addEventListener === "function") {
    addEventListener("pagehide", () => {
      void singleton?.flush();
    });
  }
}

function configured(): GrowthServiceClient {
  if (singleton === null) {
    throw new Error(
      "@kanzen/markdown-review-growth-client: call configureGrowthService(...) once before using reportEvent()",
    );
  }
  return singleton;
}

/**
 * Singleton form of GrowthServiceClient.reportEvent — see
 * configureGrowthService.
 *
 * Never throws, including when the client was never configured: a missing
 * configuration is a wiring bug in the consumer's startup, and this function's
 * whole contract is that a growth call cannot break a product. It reports
 * nothing and returns.
 */
export function reportEvent<Name extends EventName>(
  name: Name,
  properties: EventProperties<Name>,
): void {
  singleton?.reportEvent(name, properties);
}

/** Singleton form of GrowthServiceClient.flush. Never rejects. */
export function flush(): Promise<void> {
  return singleton?.flush() ?? Promise.resolve();
}

/** The configured singleton client, for anything the bare functions don't cover. */
export function getGrowthServiceClient(): GrowthServiceClient {
  return configured();
}
