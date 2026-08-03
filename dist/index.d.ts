import { TRPCClient } from '@trpc/client';
import { z } from 'zod';

declare const DEVICE_TYPES: readonly [
	"mobile",
	"tablet",
	"desktop"
];
export type DeviceType = (typeof DEVICE_TYPES)[number];
/**
 * Event context derived from one HTTP request.
 *
 * Every property is optional on purpose: an underivable value is OMITTED rather
 * than defaulted to a placeholder. A literal `"unknown"` would become a real
 * value in every PostHog breakdown and pollute the one dimension the property
 * exists to provide (AD-request-context).
 */
export type RequestContext = {
	$browser?: string;
	$os?: string;
	$device_type?: DeviceType;
	$geoip_country_code?: string;
};
export type TrpcContext = {
	/** From the verified Clerk session only — never from a request payload. */
	clerkUserId: string | null;
	/**
	 * Derived from the request's own headers, never from the payload
	 * (C-request-context, AD-request-context). Both procedure classes get it:
	 * an anonymous pre-sign-in event has a browser and a country just as an
	 * attributed one does.
	 */
	requestContext: RequestContext;
};
/** What the consumer gets back. Accepted count only — delivery is best-effort. */
export type ReportEventResult = {
	accepted: number;
};
declare const appRouter: import("@trpc/server").TRPCBuiltRouter<{
	ctx: TrpcContext;
	meta: object;
	errorShape: import("@trpc/server").TRPCDefaultErrorShape;
	transformer: false;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
	v1: import("@trpc/server").TRPCBuiltRouter<{
		ctx: TrpcContext;
		meta: object;
		errorShape: import("@trpc/server").TRPCDefaultErrorShape;
		transformer: false;
	}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
		/**
		 * Report one or more catalog events for the calling session's own account.
		 *
		 * Attribution comes from the verified session; nothing in the payload can
		 * name a different user (PRD NFR-event-integrity). Answers as soon as the
		 * batch is accepted — downstream writes never block the response
		 * (PRD FR-event-reporting).
		 */
		reportEvent: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				app: string;
				events: {
					name: string;
					properties?: Record<string, unknown> | undefined;
				}[];
			};
			output: ReportEventResult;
			meta: object;
		}>;
		/**
		 * Report anonymous, pre-sign-in events (PRD FR-event-reporting), keyed by
		 * the consumer's visitor id rather than a session.
		 *
		 * Public by deliberate choice, not by omission: these events happen before
		 * any Clerk session exists, and first-touch attribution attaches to them.
		 * Only catalog events marked anonymous may travel this way — an attributed
		 * event arriving here has nobody to belong to and is rejected.
		 */
		reportAnonymousEvent: import("@trpc/server").TRPCMutationProcedure<{
			input: {
				app: string;
				events: {
					name: string;
					properties?: Record<string, unknown> | undefined;
				}[];
				visitorId: string;
			};
			output: ReportEventResult;
			meta: object;
		}>;
	}>>;
}>>;
export type AppRouter = typeof appRouter;
declare const eventDefinitions: {
	readonly landing_viewed: {
		readonly producer: "anonymous";
		readonly properties: z.ZodObject<{
			url: z.ZodURL;
			referrer: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	};
	readonly demo_opened: {
		readonly producer: "anonymous";
		readonly properties: z.ZodObject<{
			url: z.ZodURL;
			referrer: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	};
	readonly public_pr_loaded: {
		readonly producer: "anonymous";
		readonly properties: z.ZodObject<{
			numberOfMarkdownFiles: z.ZodOptional<z.ZodNumber>;
			numberOfSections: z.ZodOptional<z.ZodNumber>;
			containsMermaid: z.ZodOptional<z.ZodBoolean>;
			containsTables: z.ZodOptional<z.ZodBoolean>;
			repositoryOwnerType: z.ZodOptional<z.ZodEnum<{
				user: "user";
				organization: "organization";
			}>>;
			url: z.ZodURL;
			referrer: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	};
	readonly signup_started: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{}, z.core.$strip>;
	};
	readonly signup_completed: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			visitorId: z.ZodOptional<z.ZodUUID>;
		}, z.core.$strip>;
	};
	readonly github_connected: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			githubAppOrPat: z.ZodOptional<z.ZodEnum<{
				github_app: "github_app";
				pat: "pat";
			}>>;
		}, z.core.$strip>;
	};
	readonly github_app_installed: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			organizationId: z.ZodString;
			repositoryOwnerType: z.ZodOptional<z.ZodEnum<{
				user: "user";
				organization: "organization";
			}>>;
			githubAppOrPat: z.ZodOptional<z.ZodEnum<{
				github_app: "github_app";
				pat: "pat";
			}>>;
		}, z.core.$strip>;
	};
	readonly real_pr_opened: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			numberOfMarkdownFiles: z.ZodOptional<z.ZodNumber>;
			numberOfSections: z.ZodOptional<z.ZodNumber>;
			containsMermaid: z.ZodOptional<z.ZodBoolean>;
			containsTables: z.ZodOptional<z.ZodBoolean>;
			repositoryVisibility: z.ZodEnum<{
				public: "public";
				private: "private";
			}>;
			repositoryOwnerType: z.ZodOptional<z.ZodEnum<{
				user: "user";
				organization: "organization";
			}>>;
			githubAppOrPat: z.ZodOptional<z.ZodEnum<{
				github_app: "github_app";
				pat: "pat";
			}>>;
		}, z.core.$strip>;
	};
	readonly section_reviewed: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			numberOfMarkdownFiles: z.ZodOptional<z.ZodNumber>;
			numberOfSections: z.ZodOptional<z.ZodNumber>;
			containsMermaid: z.ZodOptional<z.ZodBoolean>;
			containsTables: z.ZodOptional<z.ZodBoolean>;
		}, z.core.$strip>;
	};
	readonly review_resumed: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			numberOfMarkdownFiles: z.ZodOptional<z.ZodNumber>;
			numberOfSections: z.ZodOptional<z.ZodNumber>;
			containsMermaid: z.ZodOptional<z.ZodBoolean>;
			containsTables: z.ZodOptional<z.ZodBoolean>;
		}, z.core.$strip>;
	};
	readonly review_completed: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			numberOfMarkdownFiles: z.ZodOptional<z.ZodNumber>;
			numberOfSections: z.ZodOptional<z.ZodNumber>;
			containsMermaid: z.ZodOptional<z.ZodBoolean>;
			containsTables: z.ZodOptional<z.ZodBoolean>;
		}, z.core.$strip>;
	};
	readonly comment_created: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{}, z.core.$strip>;
	};
	readonly review_link_shared: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			shareId: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	};
	readonly shared_link_opened: {
		readonly producer: "anonymous";
		readonly properties: z.ZodObject<{
			url: z.ZodURL;
			referrer: z.ZodOptional<z.ZodString>;
			shareId: z.ZodOptional<z.ZodString>;
		}, z.core.$strip>;
	};
	readonly pricing_viewed: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{}, z.core.$strip>;
	};
	readonly checkout_started: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			plan: z.ZodOptional<z.ZodString>;
			planPeriod: z.ZodOptional<z.ZodEnum<{
				month: "month";
				annual: "annual";
			}>>;
		}, z.core.$strip>;
	};
	readonly trial_started: {
		readonly producer: "service";
		readonly properties: z.ZodObject<{
			plan: z.ZodOptional<z.ZodString>;
			planPeriod: z.ZodOptional<z.ZodEnum<{
				month: "month";
				annual: "annual";
			}>>;
		}, z.core.$strip>;
	};
	readonly subscription_started: {
		readonly producer: "service";
		readonly properties: z.ZodObject<{
			plan: z.ZodOptional<z.ZodString>;
			planPeriod: z.ZodOptional<z.ZodEnum<{
				month: "month";
				annual: "annual";
			}>>;
		}, z.core.$strip>;
	};
	readonly subscription_cancelled: {
		readonly producer: "service";
		readonly properties: z.ZodObject<{
			plan: z.ZodOptional<z.ZodString>;
			planPeriod: z.ZodOptional<z.ZodEnum<{
				month: "month";
				annual: "annual";
			}>>;
		}, z.core.$strip>;
	};
	readonly feedback_submitted: {
		readonly producer: "attributed";
		readonly properties: z.ZodObject<{
			survey: z.ZodOptional<z.ZodString>;
			rating: z.ZodOptional<z.ZodNumber>;
		}, z.core.$strip>;
	};
};
export type EventName = keyof typeof eventDefinitions;
/** The property shape of one catalog event, as consumers see it. */
export type EventProperties<Name extends EventName> = z.infer<(typeof eventDefinitions)[Name]["properties"]>;
/** Catalog event names that may be reported without a session (public procedure). */
export type AnonymousEventName = {
	[Name in EventName]: (typeof eventDefinitions)[Name]["producer"] extends "anonymous" ? Name : never;
}[EventName];
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
export declare function createGrowthServiceClient(options: GrowthServiceClientOptions): GrowthServiceClient;
export declare function configureGrowthService(options: GrowthServiceClientOptions): void;
/**
 * Singleton form of GrowthServiceClient.reportEvent — see
 * configureGrowthService.
 *
 * Never throws, including when the client was never configured: a missing
 * configuration is a wiring bug in the consumer's startup, and this function's
 * whole contract is that a growth call cannot break a product. It reports
 * nothing and returns.
 */
export declare function reportEvent<Name extends EventName>(name: Name, properties: EventProperties<Name>): void;
/** Singleton form of GrowthServiceClient.flush. Never rejects. */
export declare function flush(): Promise<void>;
/** The configured singleton client, for anything the bare functions don't cover. */
export declare function getGrowthServiceClient(): GrowthServiceClient;

export {};
