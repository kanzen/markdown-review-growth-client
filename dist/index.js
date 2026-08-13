// client.ts
import { createTRPCClient, httpLink } from "@trpc/client";
var PRODUCTION_ORIGIN = "https://markdown-review-growth.kanzen.sh";
function createGrowthServiceClient(options) {
  const origin = (options.serviceOrigin ?? PRODUCTION_ORIGIN).replace(/\/$/, "");
  const trpc = createTRPCClient({
    links: [
      httpLink({
        url: `${origin}/api/trpc`,
        headers: () => ({ authorization: `Bearer ${options.secret}` }),
        fetch: options.fetch
      })
    ]
  });
  return {
    app: options.app,
    ping: () => trpc.ping.query(),
    ingestEvent: (input) => trpc.ingestEvent.mutate(input),
    trpc
  };
}
var singleton;
function configureGrowthService(options) {
  singleton = createGrowthServiceClient(options);
}
function getGrowthServiceClient() {
  if (singleton === undefined) {
    throw new Error("@kanzen/markdown-review-growth-client is not configured — call configureGrowthService() at startup");
  }
  return singleton;
}
function ping() {
  return getGrowthServiceClient().ping();
}
function ingestEvent(input) {
  return getGrowthServiceClient().ingestEvent(input);
}
export {
  ping,
  ingestEvent,
  getGrowthServiceClient,
  createGrowthServiceClient,
  configureGrowthService
};
