# @kanzen/markdown-review-growth-client

The ready-made client and contract types for the **kanzen growth service**
consumer API (`growth.kanzen.sh`): configure once, then call `reportEvent()`
anywhere — including outside React and after unmount.

```ts
// once, at app startup:
import { configureGrowthService } from "@kanzen/markdown-review-growth-client";

configureGrowthService({
  app: "markdown-review",                        // your app id
  getSessionToken: () => session.getToken(),     // Clerk session JWT (shared instance)
  getVisitorId: () => visitorId,                 // anonymous visitor id (a UUID), or null
  // serviceOrigin: "http://localhost:3200",     // override for local dev
});
```

```ts
// anywhere:
import { reportEvent } from "@kanzen/markdown-review-growth-client";

reportEvent("section_reviewed", { numberOfSections: 3 });
reportEvent("real_pr_opened", { repositoryVisibility: "private" });
reportEvent("landing_viewed", { url: location.href });
```

## It cannot cost you a review

`reportEvent` **returns synchronously, never throws, and never rejects**. It
enqueues; delivery happens in the background, batched, with bounded retry, and
failures are dropped silently. If the growth service is slow, erroring, or
entirely down, your product behaves exactly as if it were healthy — growth is
instrumentation, so it is allowed to lose events and never allowed to cost a
review.

Consequences worth knowing:

- Event counts are approximate by design; funnel *ratios* are what they are for.
- The queue is capped, so an unreachable service cannot grow it without bound.
- Nothing is registered that can delay a navigation. The singleton does a
  best-effort drain on `pagehide`, deliberately without awaiting it.

## Which events need what

Event names and their property shapes are types, so a typo or a missing
required property fails **your** build, not silently at runtime.

The client picks the right API procedure for you, from the identity available
at send time:

| You have | What happens |
| --- | --- |
| A session token | Everything is reported against the verified session |
| No token, but a visitor id | Pre-sign-in events (`landing_viewed`, `demo_opened`, `public_pr_loaded`, `shared_link_opened`) are reported anonymously |
| Neither | Nothing is sent — an event with no identity has nothing to belong to |

Events are attributed to the verified session and never to a user named in the
payload, which is why a session **token** is required rather than a user id: a
user id in a request body is trivially forged.

Report `location.href` **including the fragment** on landing events. Browsers
never transmit a fragment, so the service can only see deep-link context
because the client put it in the payload. The service parses the URL and keeps
only the labels it derives — the raw URL is not retained.

## Multiple instances

`createGrowthServiceClient(options)` returns the same surface without touching
the singleton (tests, several apps). The raw typed tRPC client is available as
`.trpc` / `getGrowthServiceClient().trpc`.

Dependencies are self-contained: `@trpc/client` (runtime), `@trpc/server` and
`zod` (types only — no zod reaches your runtime bundle).

Versioning: **minor** = a new API major namespace was added; **major** = an old
API major was removed (its calls then fail at compile time).

Built from the real router and event catalog of the kanzen growth service: this
repo lives nested at `markdown-review-growth-client/` inside a checkout of the
service repo, and `bun run build` emits the types from the service's actual
source — so they cannot drift from the server.
