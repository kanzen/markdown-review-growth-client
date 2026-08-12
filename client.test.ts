// Client tests — runnable only from the nested checkout inside the service
// repo (SAD-nested-client-repo): they import the real router from ../src so
// the tested contract is the deployed one, not a mock's.
import { describe, expect, test } from "bun:test";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { appRouter } from "../src/server/router";

import { createGrowthServiceClient } from "./client";

// In-process "deployment": the client's fetch dispatches straight into the
// real router, so the test exercises serialization, the endpoint path, and
// the generated types end to end.
function serviceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: new Request(input, init),
    router: appRouter,
    createContext: () => ({}),
  });
}

describe("createGrowthServiceClient", () => {
  test("ping round-trips through the real router", async () => {
    const client = createGrowthServiceClient({
      app: "markdown-review",
      serviceOrigin: "http://growth.test",
      fetch: serviceFetch,
    });

    expect(await client.ping()).toEqual({ ok: true, service: "markdown-review-growth" });
  });

  test("failures propagate to the caller — never swallowed (write-before-success)", async () => {
    const client = createGrowthServiceClient({
      app: "markdown-review",
      serviceOrigin: "http://growth.test",
      fetch: () => Promise.resolve(new Response("upstream down", { status: 500 })),
    });

    expect(client.ping()).rejects.toThrow();
  });
});
