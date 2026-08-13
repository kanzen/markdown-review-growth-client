// Client tests — runnable only from the nested checkout inside the service
// repo (SAD-nested-client-repo): they import the real router from ../src so
// the tested contract is the deployed one, not a mock's.
import { beforeAll, describe, expect, test } from "bun:test";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "../src/server/router";
import { createServiceContext } from "../src/server/trpc";

import { createGrowthServiceClient } from "./client";

const SECRET = "test-ingest-secret";

beforeAll(() => {
  // serviceProcedure reads the secret lazily per call (AD-ingest-auth), so
  // setting it here is enough for the in-process dispatch below.
  process.env.INGEST_SHARED_SECRET = SECRET;
});

// In-process "deployment": the client's fetch dispatches straight into the
// real router, so the test exercises serialization, the endpoint path, auth
// headers, and the generated types end to end.
function serviceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createServiceContext(req),
  });
}

function testClient(secret: string) {
  return createGrowthServiceClient({
    app: "markdown-review",
    secret,
    serviceOrigin: "http://growth.test",
    fetch: serviceFetch,
  });
}

describe("createGrowthServiceClient", () => {
  test("ping round-trips through the real router", async () => {
    expect(await testClient(SECRET).ping()).toEqual({
      ok: true,
      service: "markdown-review-growth",
    });
  });

  test("failures propagate to the caller — never swallowed (write-before-success)", async () => {
    const client = createGrowthServiceClient({
      app: "markdown-review",
      secret: SECRET,
      serviceOrigin: "http://growth.test",
      fetch: () => Promise.resolve(new Response("upstream down", { status: 500 })),
    });

    expect(client.ping()).rejects.toThrow();
  });

  test("ingestEvent rejects a wrong credential (AD-ingest-auth)", () => {
    expect(
      testClient("not-the-secret").ingestEvent({
        eventId: "7f0d34a2-6f2e-4a2b-9a44-0f6de1b2c3d4",
        name: "comment_created",
        userId: "user_123",
        occurredAt: "2026-08-13T10:00:00.000Z",
        properties: { pr_hash: "abc" },
      }),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });

  test("ingestEvent rejects unknown event names through the wire (FR-ingest-validation)", () => {
    expect(
      testClient(SECRET).ingestEvent({
        eventId: "7f0d34a2-6f2e-4a2b-9a44-0f6de1b2c3d5",
        name: "made_up_event",
        userId: "user_123",
        occurredAt: "2026-08-13T10:00:00.000Z",
        properties: {},
      }),
    ).rejects.toThrow(/Unknown event name/);
  });
});
