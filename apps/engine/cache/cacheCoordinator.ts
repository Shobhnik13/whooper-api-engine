import { RouteConfig } from "../config/types";
import { GatewayResponse } from "../gateway/response";
import { InvalidationService } from "../invalidate/invalidation.service";
import { logger } from "../logger";
import { OriginProxy } from "../proxy/origin.proxy";
import { CacheService } from "./cache.service";
import { RevalidationService } from "./revalidation.service";
import { SingleFlight } from "./singleFlight";

const FOLLOWER_WAIT_TIMEOUT_MS = 1000;
const FOLLOWER_POLL_INTERVAL_MS = 50;

export class CacheCoordinator {
    constructor(
        private cache: CacheService,
        private proxy: OriginProxy,
        private sf: SingleFlight,
        private invalidation: InvalidationService,
        private revalidation: RevalidationService
    ) { }

    async handle(req: any, route: RouteConfig, cleanedUrl: string, cacheKey: string): Promise<GatewayResponse> {
        // CASE 1: cache disabled
        if (route.cacheMode === "none") {
            const r = await this.proxy.forward(req, route.origin, cleanedUrl);
            await this.invalidation.invalidateForRoute(route);

            return {
                status: r.status,
                body: r.body,
                headers: {
                    ...r.headers,
                    "X-Cache": "BYPASS",
                    "X-Route-Id": route.routeId
                }
            };
        }

        // CASE 2: cache enabled 
        const cached = await this.cache.getRaw(cacheKey);

        // possibilty 1: we have a valid cache entry, serve it
        if (cached && !cached.invalidated) {
            return {
                status: 200,
                body: cached.current ?? cached.prev ?? "",
                headers: {
                    "X-Cache": "HIT",
                    "X-Route-Id": route.routeId
                }
            };
        }

        // possibility 2: we have an invalidated entry, serve stale if possible and trigger background refresh
        if (cached?.invalidated) {
            // cache was invalidated but then also we dont have any previous value to serve, so this is just a cache miss
            if (!cached.prev) {
                return this.handleMiss(req, route, cleanedUrl, cacheKey);
            }

            // we found a cached.prev value so serve it and trigger bg refresh
            const lock = await this.sf.acquireLock(cacheKey);

            if (lock.acquired) {
                logger.info({ cacheKey, routeId: route.routeId }, "Cache stale, refreshing in background");
                this.revalidation.refreshInBackground(req, route, cleanedUrl, cacheKey, lock, this.sf.releaseLock.bind(this.sf));
            }

            return {
                status: 200,
                body: cached.prev ?? "",
                headers: {
                    "X-Cache": "STALE",
                    "X-Route-Id": route.routeId
                }
            };
        }

        // CASE 3: cache miss
        return this.handleMiss(req, route, cleanedUrl, cacheKey);
    }

    private async handleMiss(req: any, route: RouteConfig, cleanedUrl: string, cacheKey: string): Promise<GatewayResponse> {
        logger.info({ cacheKey, routeId: route.routeId }, "Cache miss, acquiring single-flight lock");
        const lock = await this.sf.acquireLock(cacheKey);

        if (lock.acquired) {
            try {
                const r = await this.proxy.forward(req, route.origin, cleanedUrl);

                if (r.status >= 200 && r.status < 300) {
                    await this.cache.set(cacheKey, r.body, route.ttl);
                    logger.info({ cacheKey, routeId: route.routeId, ttl: route.ttl }, "Response cached");
                }

                return {
                    status: r.status,
                    body: r.body,
                    headers: {
                        ...r.headers,
                        "X-Cache": "MISS",
                        "X-Route-Id": route.routeId
                    }
                };
            } finally {
                await this.sf.releaseLock(lock);
            }
        }

        // if multiple requests come in for the same cacheKey while the lock is held, they will wait for the lock to be released and then check the cache again. This way we avoid thundering herd on the origin and also serve stale data if available.
        const retry = await this.waitForCache(cacheKey);

        if (retry) {
            return {
                status: 200,
                body: retry,
                headers: {
                    "X-Cache": "FOLLOWER",
                    "X-Route-Id": route.routeId
                }
            };
        }

        return {
            status: 503,
            body: "Service busy"
        };
    }

    private async waitForCache(cacheKey: string) {
        const deadline = Date.now() + FOLLOWER_WAIT_TIMEOUT_MS;

        while (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, FOLLOWER_POLL_INTERVAL_MS));

            const retry = await this.cache.get(cacheKey);
            if (retry) return retry;
        }

        return null;
    }
}
