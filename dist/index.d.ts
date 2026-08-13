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
			eventId: string;
			name: string;
			userId: string;
			occurredAt: string;
			properties?: Record<string, unknown> | undefined;
		};
		output: {
			persisted: boolean;
			droppedProperties: string[];
		};
		meta: object;
	}>;
}>>;
export type AppRouter = typeof appRouter;
export type IngestEventInput = inferRouterInputs<AppRouter>["ingestEvent"];
export type IngestEventResult = inferRouterOutputs<AppRouter>["ingestEvent"];
export type GrowthServiceClientOptions = {
	/**
	 * The consumer product's app id, e.g. "markdown-review". A client-side
	 * label only (decided 2026-08-13): it is not sent on ingest calls — the
	 * route identifies its caller by the credential (AD-ingest-auth).
	 */
	app: string;
	/**
	 * The shared ingest credential (AD-ingest-auth), sent as a bearer token
	 * on every call. Provisioned as `INGEST_SHARED_SECRET` on the service and
	 * under the consumer's own env name on the product
	 * (`MARKDOWN_REVIEW_GROWTH_INGEST_SECRET`).
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
	 * (write-before-success). `persisted: false` means the event was already
	 * recorded — a retry or latch duplicate, not an error.
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
