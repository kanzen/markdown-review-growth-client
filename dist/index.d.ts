import { TRPCClient } from '@trpc/client';
import { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export type ServiceContext = {
	authorizationHeader: string | null;
};
declare const appRouter: import("@trpc/server").TRPCBuiltRouter<{
	ctx: ServiceContext;
	meta: object;
	errorShape: import("@trpc/server").TRPCDefaultErrorShape;
	transformer: false;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
	ping: import("@trpc/server").TRPCQueryProcedure<{
		input: void;
		output: {
			ok: true;
			service: "markdown-review-growth";
		};
		meta: object;
	}>;
	ingestEvent: import("@trpc/server").TRPCMutationProcedure<{
		input: {
			name: "signup_completed";
			properties: {
				acquisition_source?: string | undefined;
				campaign?: string | undefined;
			};
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "github_app_installed";
			properties: {
				organization_id: string;
				owner_type: "user" | "organization";
			};
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "real_pr_opened";
			properties: {
				pr_hash: string;
				repository_hash: string;
				repository_visibility: "public" | "private";
				repository_owner_type: "user" | "organization";
				number_of_markdown_files: number;
				number_of_sections: number;
				contains_mermaid: boolean;
				contains_tables: boolean;
				organization_id?: string | undefined;
				github_app_or_pat?: "github_app" | "pat" | undefined;
			};
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "section_reviewed";
			properties: {
				pr_hash: string;
				milestone: 1 | 3 | 11;
				sections_marked: number;
			};
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "review_completed";
			properties: {
				pr_hash: string;
				sections_marked: number;
			};
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "comment_created";
			properties: {
				pr_hash: string;
			};
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "shared_link_opened";
			properties: {
				pr_hash: string;
				acquisition_source?: string | undefined;
				campaign?: string | undefined;
			};
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "trial_started";
			properties: Record<string, never>;
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "subscription_started";
			properties: Record<string, never>;
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "subscription_cancelled";
			properties: Record<string, never>;
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		} | {
			name: "feedback_submitted";
			properties: {
				feedback_source: "survey" | "exit_survey";
				text: string;
			};
			eventId: string;
			userId: string;
			occurredAt: string;
			context?: {
				userAgent?: string | undefined;
				country?: string | undefined;
			} | undefined;
		};
		output: {
			persisted: boolean;
		};
		meta: object;
	}>;
}>>;
export type AppRouter = typeof appRouter;
export type IngestEventInput = inferRouterInputs<AppRouter>["ingestEvent"];
export type IngestEventResult = inferRouterOutputs<AppRouter>["ingestEvent"];
/** The event names the service accepts — the mirrored, product-reported events. */
export type IngestEventName = IngestEventInput["name"];
/**
 * The property shape of one accepted event, e.g.
 * `IngestEventProperties<"comment_created">` is `{ pr_hash: string }`. The
 * product's tracking module derives its mirrored payload types from this
 * instead of keeping an independent copy.
 */
export type IngestEventProperties<N extends IngestEventName> = Extract<IngestEventInput, {
	name: N;
}>["properties"];
export type GrowthServiceClientOptions = {
	/**
	 * The consumer product's app id, e.g. "markdown-review". A client-side
	 * label only (decided 2026-08-13): it is not sent on ingest calls — the
	 * route identifies its caller by the credential (AD-ingest-auth).
	 */
	app: string;
	/**
	 * The shared ingest credential (AD-ingest-auth), sent as a bearer token
	 * on every call. Provisioned as `MARKDOWN_REVIEW_GROWTH_INGEST_SECRET` —
	 * same name and value — on both the service and the product.
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
	ping: () => Promise<{
		ok: true;
		service: "markdown-review-growth";
	}>;
	/**
	 * Mirror one product-reported event (PRD FR-event-ingestion) — the
	 * working surface of this package. Awaited within the product request
	 * that carries the state change; throws on any failure
	 * (write-before-success). `properties` is typed per `name`, so a payload
	 * outside the service's catalog does not compile. `persisted: false`
	 * means the event was already recorded — a retry or latch duplicate, not
	 * an error.
	 */
	ingestEvent: (input: IngestEventInput) => Promise<IngestEventResult>;
	/** The underlying typed tRPC client, for procedures this wrapper doesn't cover. */
	trpc: TRPCClient<AppRouter>;
};
/** Multi-instance factory (SAD-client-package); most consumers want `configureGrowthService` instead. */
export declare function createGrowthServiceClient(options: GrowthServiceClientOptions): GrowthServiceClient;
/** Configure the singleton once, at app startup (SAD-client-package). */
export declare function configureGrowthService(options: GrowthServiceClientOptions): void;
export declare function getGrowthServiceClient(): GrowthServiceClient;
/** Bare-call form of `GrowthServiceClient.ping` on the configured singleton. */
export declare function ping(): Promise<{
	ok: true;
	service: "markdown-review-growth";
}>;
/** Bare-call form of `GrowthServiceClient.ingestEvent` on the configured singleton. */
export declare function ingestEvent(input: IngestEventInput): Promise<IngestEventResult>;

export {};
