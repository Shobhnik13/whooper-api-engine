import { RouteConfig } from "../config/types";
import { logger } from "../logger";
import { OriginProxy } from "../proxy/origin.proxy";
import { CacheService } from "./cache.service";
import { SingleFlightLock } from "./singleFlight";

export class RevalidationService {
    // a set to keep track of currently running background refreshes to avoid multiple concurrent refreshes for the same cache key
    private running = new Set<string>();

    constructor(
        private cache: CacheService,
        private proxy: OriginProxy
    ) { }

    refreshInBackground(req: any, route: RouteConfig, cleanedUrl: string, cacheKey: string, lock: SingleFlightLock, release: (lock: SingleFlightLock) => Promise<unknown>) {
        if (this.running.has(cacheKey)) {
            logger.info({ cacheKey, routeId: route.routeId }, "Background cache refresh already in progress, skipping concurrent refresh");
            return;
        }

        this.running.add(cacheKey);

        void (async () => {
            try {
                const r = await this.proxy.forward(req, route.origin, cleanedUrl);
                if (r.status >= 200 && r.status < 300) {
                    await this.cache.set(cacheKey, r.body, route.ttl);
                }
            } catch (err) {
                logger.error({ err, cacheKey, routeId: route.routeId }, "Background cache revalidation failed");
            } finally {
                this.running.delete(cacheKey);
                await release(lock);
            }
        })();
    }
}
