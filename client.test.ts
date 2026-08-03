import { accountWrites, authMock, resetHarness, signedIn, signedOut, visitorWrites } from "../src/test/harness";

import { beforeEach, describe, expect, test } from "bun:test";

import type { EventProperties } from "../src/lib/catalog";

import type { GrowthServiceClientOptions } from "./client";

const { POST } = await import("../src/app/api/trpc/[trpc]/route");
const { configureGrowthService, createGrowthServiceClient, flush, reportEvent } = await import(
  "./client"
);

// C-growth-client (AD-bun-tests). Two things are under test here, and the
// second is the one that matters most.
//
// 1. The shipped client speaks the REAL server's protocol: these tests wire the
//    client's fetch straight into the actual route handler, so URL shape, body
//    encoding, procedure routing, and the Authorization header are exercised
//    end to end. A drift between the published client and the server breaks
//    here first.
// 2. The fire-and-forget contract (PRD NFR-consumer-isolation,
//    SC-zero-product-impact) is asserted against a FAILING service: with every
//    request erroring, hanging, or rejecting, `reportEvent` still returns
//    synchronously and nothing ever rejects into consumer code. That guarantee
//    is a test, not a hope.

const VISITOR_ID = "6f1a9c5e-6f9a-4f2e-9a3f-2b1c4d5e6f70";
const ORIGIN = "http://localhost:3200";

let sentRequests: Request[] = [];

beforeEach(() => {
  resetHarness();
  sentRequests = [];
});

function makeClient(overrides: Partial<GrowthServiceClientOptions> = {}) {
  return createGrowthServiceClient({
    app: "markdown-review",
    serviceOrigin: ORIGIN,
    getSessionToken: () => "clerk-session-jwt",
    getVisitorId: () => VISITOR_ID,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      sentRequests.push(request.clone());
      return POST(request);
    },
    ...overrides,
  });
}

/** A client whose transport always fails the way `mode` says. */
function makeFailingClient(mode: "reject" | "500" | "hang") {
  return makeClient({
    fetch: async (input, init) => {
      sentRequests.push(new Request(input, init).clone());
      if (mode === "reject") throw new Error("network is gone");
      if (mode === "hang") return new Promise<Response>(() => {});
      return new Response("upstream exploded", { status: 500 });
    },
  });
}

function pathOf(request: Request): string {
  return new URL(request.url).pathname;
}

// FIRST, deliberately: the module-scope singleton is still unset here, and
// nothing later in this file can put it back.
describe("before configuration", () => {
  test("the singleton reports nothing rather than throwing when never configured", async () => {
    expect(() => reportEvent("section_reviewed", {})).not.toThrow();
    await expect(flush()).resolves.toBeUndefined();
  });
});

describe("round-trip against the real route handler", () => {
  test("an attributed event reaches v1.reportEvent with the session and app id", async () => {
    authMock.mockImplementation(async () => signedIn("user_a"));
    const growth = makeClient();

    growth.reportEvent("section_reviewed", { numberOfSections: 3 });
    await growth.flush();

    const sent = sentRequests.at(-1)!;
    expect(pathOf(sent)).toBe("/api/trpc/v1.reportEvent");
    expect(sent.headers.get("authorization")).toBe("Bearer clerk-session-jwt");
    expect(await sent.json()).toMatchObject({
      app: "markdown-review",
      events: [{ name: "section_reviewed", properties: { numberOfSections: 3 } }],
    });
    // The server ran for real: the account was touched by the ingestion path.
    expect(accountWrites.at(-1)).toMatchObject({ clerkUserId: "user_a" });
  });

  test("with no session, an anonymous event takes the public procedure and carries the visitor id", async () => {
    authMock.mockImplementation(async () => signedOut());
    const growth = makeClient({ getSessionToken: () => null });

    growth.reportEvent("landing_viewed", { url: "https://markdown-review.kanzen.sh/?utm_source=github" });
    await growth.flush();

    const sent = sentRequests.at(-1)!;
    expect(pathOf(sent)).toBe("/api/trpc/v1.reportAnonymousEvent");
    // Public procedure: no session, so no Authorization header is sent at all.
    expect(sent.headers.get("authorization")).toBeNull();
    expect(await sent.json()).toMatchObject({ visitorId: VISITOR_ID });
    // First touch was staged against the visitor, which is the whole point of
    // reporting the landing URL (C-attribution).
    expect(visitorWrites.at(-1)).toMatchObject({ visitorId: VISITOR_ID });
  });

  test("with a session, an anonymous-eligible event is attributed instead", async () => {
    authMock.mockImplementation(async () => signedIn("user_a"));
    const growth = makeClient();

    growth.reportEvent("landing_viewed", { url: "https://markdown-review.kanzen.sh/" });
    await growth.flush();

    // Recorded against the verified session — strictly better data than
    // reporting a signed-in visitor anonymously.
    expect(pathOf(sentRequests.at(-1)!)).toBe("/api/trpc/v1.reportEvent");
    expect(accountWrites.at(-1)).toMatchObject({ clerkUserId: "user_a" });
  });

  test("the singleton surface configures once and reports from anywhere", async () => {
    authMock.mockImplementation(async () => signedIn("user_singleton"));
    configureGrowthService({
      app: "markdown-review",
      serviceOrigin: ORIGIN,
      getSessionToken: () => "jwt",
      fetch: async (input, init) => {
        const request = new Request(input, init);
        sentRequests.push(request.clone());
        return POST(request);
      },
    });

    reportEvent("comment_created", {});
    await flush();

    expect(pathOf(sentRequests.at(-1)!)).toBe("/api/trpc/v1.reportEvent");
    expect(accountWrites.at(-1)).toMatchObject({ clerkUserId: "user_singleton" });
  });
});

describe("fire-and-forget contract (NFR-consumer-isolation)", () => {
  test("reportEvent returns synchronously and never throws when the service rejects", async () => {
    const growth = makeFailingClient("reject");
    expect(growth.reportEvent("section_reviewed", {})).toBeUndefined();
    // And the drain resolves rather than rejecting — the failure is swallowed.
    await expect(growth.flush()).resolves.toBeUndefined();
  });

  test("a 500 from the service never reaches consumer code", async () => {
    const growth = makeFailingClient("500");
    growth.reportEvent("section_reviewed", {});
    await expect(growth.flush()).resolves.toBeUndefined();
  });

  test("a hanging service never blocks the caller", async () => {
    const growth = makeFailingClient("hang");

    const start = performance.now();
    growth.reportEvent("section_reviewed", {});
    // The report call cannot be waiting on a request that never settles.
    expect(performance.now() - start).toBeLessThan(50);

    let drained = false;
    void growth.flush().then(() => {
      drained = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The delivery is still stuck — and the product has not noticed.
    expect(drained).toBe(false);
  });

  test("an event the server rejects is dropped without a retry storm", async () => {
    authMock.mockImplementation(async () => signedIn("user_a"));
    const growth = makeClient();

    // A consumer that bypassed the types: landing_viewed requires a url, so
    // the server answers 400. That verdict is permanent, so retrying it would
    // burn the product's network for nothing.
    growth.reportEvent("landing_viewed", {} as EventProperties<"landing_viewed">);
    await expect(growth.flush()).resolves.toBeUndefined();
    expect(sentRequests.length).toBe(1);
  });

  test("a service-emitted billing event is refused by the server and dropped quietly", async () => {
    authMock.mockImplementation(async () => signedIn("user_a"));
    const growth = makeClient();

    // trial_started is service-emitted (webhook only, AD-billing-webhooks).
    // Note it currently TYPECHECKS: narrowing reportEvent so a consumer cannot
    // even name it is the ConsumerEventName change (KAN-713). Until then the
    // server is the only thing refusing it — which it does, permanently.
    growth.reportEvent("trial_started", {});
    await expect(growth.flush()).resolves.toBeUndefined();
    expect(sentRequests.length).toBe(1);
  });

  test("a transient failure is retried, then succeeds", async () => {
    authMock.mockImplementation(async () => signedIn("user_a"));
    let attempts = 0;
    const growth = makeClient({
      fetch: async (input, init) => {
        const request = new Request(input, init);
        sentRequests.push(request.clone());
        attempts += 1;
        if (attempts === 1) throw new Error("connection reset");
        return POST(request);
      },
    });

    growth.reportEvent("section_reviewed", {});
    await growth.flush();

    expect(attempts).toBe(2);
    expect(accountWrites.at(-1)).toMatchObject({ clerkUserId: "user_a" });
  });

  test("delivery is abandoned after bounded retries rather than looping forever", async () => {
    const growth = makeFailingClient("reject");
    growth.reportEvent("section_reviewed", {});
    await growth.flush();
    // Three attempts, then the batch is dropped for good.
    expect(sentRequests.length).toBe(3);

    // A second flush must not resurrect the dropped batch.
    await growth.flush();
    expect(sentRequests.length).toBe(3);
  });

});

describe("batching and queue bounds", () => {
  test("a burst travels as one request", async () => {
    authMock.mockImplementation(async () => signedIn("user_a"));
    const growth = makeClient();

    growth.reportEvent("section_reviewed", { numberOfSections: 1 });
    growth.reportEvent("section_reviewed", { numberOfSections: 2 });
    growth.reportEvent("comment_created", {});
    await growth.flush();

    expect(sentRequests.length).toBe(1);
    expect(await sentRequests[0]!.json()).toMatchObject({
      events: [
        { name: "section_reviewed" },
        { name: "section_reviewed" },
        { name: "comment_created" },
      ],
    });
  });

  test("a batch over the server's 50-event cap is split", async () => {
    authMock.mockImplementation(async () => signedIn("user_a"));
    const growth = makeClient();

    for (let index = 0; index < 51; index++) {
      growth.reportEvent("section_reviewed", { numberOfSections: index });
    }
    await growth.flush();

    expect(sentRequests.length).toBe(2);
    const [first, second] = await Promise.all(sentRequests.map((request) => request.json()));
    expect(first.events.length).toBe(50);
    expect(second.events.length).toBe(1);
  });

  test(
    "the queue is bounded, so an unreachable service cannot leak memory",
    async () => {
      let eventsSent = 0;
      const growth = makeClient({
        fetch: async (input, init) => {
          const request = new Request(input, init);
          eventsSent += ((await request.json()) as { events: unknown[] }).events.length;
          throw new Error("network is gone");
        },
      });

      for (let index = 0; index < 600; index++) {
        growth.reportEvent("section_reviewed", { numberOfSections: index });
      }
      await growth.flush();

      // 600 reported, 500 kept — the rest were refused entry rather than
      // buffered. Each surviving event is seen MAX_ATTEMPTS times before its
      // batch is abandoned, so the retry factor divides back out.
      expect(eventsSent / 3).toBe(500);
    },
    // Ten batches, each backing off between three attempts, so this test is
    // dominated by deliberate waiting rather than by work.
    20_000,
  );
});

describe("routing when an identity is missing", () => {
  test("an attributed event with no session is dropped, not sent unattributed", async () => {
    authMock.mockImplementation(async () => signedOut());
    const growth = makeClient({ getSessionToken: () => null });

    growth.reportEvent("section_reviewed", { numberOfSections: 3 });
    await growth.flush();

    // Nothing to attribute it to, so it never leaves the client — reporting it
    // would only earn an UNAUTHORIZED (PRD NFR-event-integrity).
    expect(sentRequests.length).toBe(0);
  });

  test("an anonymous event with no visitor id is dropped", async () => {
    authMock.mockImplementation(async () => signedOut());
    const growth = makeClient({ getSessionToken: () => null, getVisitorId: () => null });

    growth.reportEvent("landing_viewed", { url: "https://kanzen.sh/" });
    await growth.flush();

    // The ordinary case for a consent-decliner: nothing identifies the event,
    // so there is nothing to report (AD-visitor-identity).
    expect(sentRequests.length).toBe(0);
  });

  test("a throwing token source is treated as signed out, never as a crash", async () => {
    authMock.mockImplementation(async () => signedOut());
    const growth = makeClient({
      getSessionToken: () => {
        throw new Error("Clerk is not loaded yet");
      },
    });

    growth.reportEvent("landing_viewed", { url: "https://kanzen.sh/" });
    await expect(growth.flush()).resolves.toBeUndefined();
    // It fell back to the public procedure rather than losing the event.
    expect(pathOf(sentRequests.at(-1)!)).toBe("/api/trpc/v1.reportAnonymousEvent");
  });
});
