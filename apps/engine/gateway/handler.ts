import { CacheService } from "../cache/cache.service";
import { CacheCoordinator } from "../cache/cacheCoordinator";
import { CacheKeyBuilder } from "../cache/cacheKeyBuilder";
import { RevalidationService } from "../cache/revalidation.service";
import { SingleFlight } from "../cache/singleFlight";
import { RouteConfig } from "../config/types";
import { InvalidationService } from "../invalidate/invalidation.service";
import { OriginProxy } from "../proxy/origin.proxy";
import { AuthGuard } from "./authGuard";
import { GatewayResponse } from "./response";
import { RouteResolver } from "./routeResolver";

export class GatewayHandler {
    private routeResolver = new RouteResolver();
    private authGuard = new AuthGuard();
    private cacheKeyBuilder = new CacheKeyBuilder();
    private cacheCoordinator: CacheCoordinator;

    // injecting services here
    constructor(
        private cache: CacheService,
        private proxy: OriginProxy,
        private sf: SingleFlight
    ) {
        const invalidation = new InvalidationService(this.cache);
        const revalidation = new RevalidationService(this.cache, this.proxy);
        this.cacheCoordinator = new CacheCoordinator(this.cache, this.proxy, this.sf, invalidation, revalidation);
    }

    async handle(req: any, res: any, routes: RouteConfig[]) {
        const resolved = this.routeResolver.resolve(req, routes);

        if (!resolved) {
            return this.send(res, {
                status: 404,
                body: "Route not found"
            });
        }

        const authFailure = this.authGuard.verify(req, resolved.route);
        if (authFailure) return this.send(res, authFailure);

        const cacheKey = this.cacheKeyBuilder.build(req, resolved.route, resolved.cleanedUrl);
        const response = await this.cacheCoordinator.handle(req, resolved.route, resolved.cleanedUrl, cacheKey);

        return this.send(res, response);
    }

    private send(res: any, response: GatewayResponse) {
        for (const [key, value] of Object.entries(response.headers || {})) {
            res.setHeader(key, value);
        }

        return res.status(response.status).send(response.body);
    }
}
