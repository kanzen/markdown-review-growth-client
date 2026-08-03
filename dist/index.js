// client.ts
import { createTRPCClient, httpLink } from "@trpc/client";
var PRODUCTION_ORIGIN = "https://growth.kanzen.sh";
var MAX_EVENTS_PER_BATCH = 50;
var MAX_QUEUED_EVENTS = 500;
var MAX_ATTEMPTS = 3;
var RETRY_BASE_DELAY_MS = 200;
var FLUSH_DELAY_MS = 1000;
var ANONYMOUS_EVENTS = {
  landing_viewed: true,
  demo_opened: true,
  public_pr_loaded: true,
  shared_link_opened: true
};
function isAnonymousEligible(name) {
  return Object.hasOwn(ANONYMOUS_EVENTS, name);
}
function isRetryable(error) {
  const status = error?.data?.httpStatus;
  if (typeof status !== "number")
    return true;
  if (status === 408 || status === 429)
    return true;
  return status >= 500;
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function chunk(items, size) {
  const batches = [];
  for (let index = 0;index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
function createGrowthServiceClient(options) {
  const origin = (options.serviceOrigin ?? PRODUCTION_ORIGIN).replace(/\/$/, "");
  const trpc = createTRPCClient({
    links: [
      httpLink({
        url: `${origin}/api/trpc`,
        fetch: options.fetch,
        headers: async () => {
          try {
            const token = await options.getSessionToken();
            return token === null ? {} : { Authorization: `Bearer ${token}` };
          } catch {
            return {};
          }
        }
      })
    ]
  });
  let queue = [];
  let timer = null;
  let inFlight = Promise.resolve();
  function schedule() {
    if (timer !== null)
      return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, FLUSH_DELAY_MS);
    timer?.unref?.();
  }
  async function send(events, visitorId) {
    const payload = events.map((event) => ({ name: event.name, properties: event.properties }));
    for (let attempt = 1;attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        if (visitorId === null) {
          await trpc.v1.reportEvent.mutate({ app: options.app, events: payload });
        } else {
          await trpc.v1.reportAnonymousEvent.mutate({
            app: options.app,
            events: payload,
            visitorId
          });
        }
        return;
      } catch (error) {
        if (attempt === MAX_ATTEMPTS || !isRetryable(error))
          return;
        await delay(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      }
    }
  }
  function partition(events, token) {
    if (token !== null)
      return { attributed: [...events], anonymous: [] };
    return { attributed: [], anonymous: events.filter((event) => isAnonymousEligible(event.name)) };
  }
  async function drain() {
    while (queue.length > 0) {
      const draining = queue;
      queue = [];
      let token = null;
      try {
        token = await options.getSessionToken();
      } catch {
        token = null;
      }
      let visitorId = null;
      try {
        visitorId = options.getVisitorId?.() ?? null;
      } catch {
        visitorId = null;
      }
      const { attributed, anonymous } = partition(draining, token);
      for (const batch of chunk(attributed, MAX_EVENTS_PER_BATCH)) {
        await send(batch, null);
      }
      if (visitorId !== null) {
        for (const batch of chunk(anonymous, MAX_EVENTS_PER_BATCH)) {
          await send(batch, visitorId);
        }
      }
    }
  }
  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    inFlight = inFlight.then(drain, () => {
      return;
    }).catch(() => {
      return;
    });
    return inFlight;
  }
  return {
    trpc,
    flush,
    reportEvent: (name, properties) => {
      try {
        if (queue.length >= MAX_QUEUED_EVENTS)
          return;
        queue.push({ name, properties });
        schedule();
      } catch {}
    }
  };
}
var singleton = null;
function configureGrowthService(options) {
  singleton = createGrowthServiceClient(options);
  if (typeof addEventListener === "function") {
    addEventListener("pagehide", () => {
      singleton?.flush();
    });
  }
}
function configured() {
  if (singleton === null) {
    throw new Error("@kanzen/markdown-review-growth-client: call configureGrowthService(...) once before using reportEvent()");
  }
  return singleton;
}
function reportEvent(name, properties) {
  singleton?.reportEvent(name, properties);
}
function flush() {
  return singleton?.flush() ?? Promise.resolve();
}
function getGrowthServiceClient() {
  return configured();
}
export {
  reportEvent,
  getGrowthServiceClient,
  flush,
  createGrowthServiceClient,
  configureGrowthService
};
