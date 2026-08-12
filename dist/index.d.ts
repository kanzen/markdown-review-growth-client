import { TRPCClient } from '@trpc/client';

declare const appRouter: import("@trpc/server").TRPCBuiltRouter<{
	ctx: object;
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
}>>;
export type AppRouter = typeof appRouter;
export type GrowthServiceClientOptions = {
	/**
	 * The consumer product's app id, e.g. "markdown-review". Stored at
	 * configure time; the ingest procedures of P-event-pipeline send it on
	 * every call.
	 */
	app: string;
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
	/** The configured consumer app id, sent with every ingest call. */
	app: string;
	/**
	 * Liveness check against the deployed service — the end-to-end proof of
	 * the generated contract at P-scaffold. Awaited; throws on any failure.
	 */
	ping: () => Promise<{
		ok: true;
		service: "markdown-review-growth";
	}>;
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

export {};
