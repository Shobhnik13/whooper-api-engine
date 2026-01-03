import { CacheService } from "../cache/cache.service";
import { SingleFlight } from "../cache/singleFlight";
import { RouteConfig } from "../config/types";
import { logger } from "../logger";
import { OriginProxy } from "../proxy/origin.proxy";
import crypto from "crypto";

const FOLLOWER_WAIT_TIME_MS = 300;
export class GatewayHandler {

    // injecting services here
    constructor(
        private cache: CacheService,
        private proxy: OriginProxy,
        private sf: SingleFlight
    ) { }

    // this will help us to clean the icoming requests 
    // like /proxy/api/v1/users -> /api/v1/users
    private cleanIncomingPath(path: string) {
        return path.replace(/^\/proxy/, "")
    }

    async handle(req: any, res: any, routes: RouteConfig[]) {
        const cleanedPath = this.cleanIncomingPath(req.path)

        // now first check that is this cleaned route is registered with us in 
        // our routeconfig

        // this means finding the route config that matches this request method and path
        const route = routes.find(r => r.method === req.method && r.matcher(cleanedPath))
        if (!route) {
            return res.status(404).json("Route not found")
        }

        // now we verified that this route exists
        // we check whether this route has an auth enabled or not


        const hasAuth = !!req.headers.authorization || !!req.headers.cookie;
        if (!hasAuth && route.authType === 'jwt') {
            return res.status(401).json("Authorization required")
        }

        // now we verified auth if required
        // now we check cache

        const cacheKey = "cache:" + route.routeId + ":" + crypto.createHash("md5").update(cleanedPath).digest("hex");

        // check whether this route has caching enabled 
        // maybe its a write operation or no caching required whicg further invalidates caache of smth
        if (route.cacheMode === "none") {
            const r = await this.proxy.forward(req, route.origin, cleanedPath);

            // INVALIDATION HAPPENS HERE
            // skip hi ho sakta hai agar is route p koi invalidation na ho
            // matlab ki is route se koi aur route invalidate na ho
            for (const inv of route.invalidates) {
                await this.cache.softInvalidateByRoute(inv.targetRouteId, route.ttl);
            }

            return res.status(r.status).send(r.body);
        }

        // now we know caching is enabled for this route
        // applying uncontrolled swr(stale while revalidate) with single flight
        // serve whatever exists

        const cached = await this.cache.getRaw(cacheKey)
        if (cached) {
            // now cache to mil gya
            // ho sakta h ki ye invalidated hone ke bad prev ho
            // annd ye key hot bhi ho
            // so hame ek refresh bhi trigger karna padega in background 

            if (cached.invalidated) {
                // vahi leader principle lagao
                logger.info(`Cache invalidated, refreshing ${cacheKey}`);
                const leader = await this.sf.acquireLock(cacheKey);

                if (leader) {
                    (async () => {
                        try {
                            const r = await this.proxy.forward(req, route.origin, cleanedPath);
                            if (r.status >= 200 && r.status < 300) {
                                await this.cache.set(cacheKey, r.body, route.ttl);
                            }
                        } catch (err) {
                            logger.error({ err, cacheKey }, "Background refresh failed");
                        }
                    })();
                }

                res.setHeader("X-Cache", "STALE");
                return res.send(cached.prev);
            }
            // normal hit
            res.setHeader("X-Cache", "HIT");
            return res.send(cached.current ?? cached.prev);
        }

        // now what if cache miss
        // we will elect one request as leader because multiple requests can come for same uncached resource
        // which will overwhelm our origin server

        logger.info(`Cache miss for key ${cacheKey}, invoking single flight`);
        const leader = await this.sf.acquireLock(cacheKey);

        if (leader) {
            logger.info(`Leader appointed for key ${cacheKey}, fetching from origin`);
            const r = await this.proxy.forward(req, route.origin, cleanedPath)

            if (r.status >= 200 && r.status < 300) {
                // cache only successful responses
                await this.cache.set(cacheKey, r.body, route.ttl);
                logger.info(`Response cached for key ${cacheKey} with TTL ${route.ttl}`);
            }

            res.setHeader("X-Cache", "MISS");
            return res.status(r.status).send(r.body);
        }

        // follower requests
        await new Promise(resolve => setTimeout(resolve, FOLLOWER_WAIT_TIME_MS));
        const retry = await this.cache.get(cacheKey)
        if (retry) {
            res.setHeader("X-Cache", "PREV");
            return res.send(retry);
        }

        // worst case: leader still rebuilding
        return res.status(503).send("Service busy");
    }
}
