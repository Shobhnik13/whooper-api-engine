import { CacheService } from "../cache/cache.service";
import { RouteConfig } from "../config/types";

export class InvalidationService {
    constructor(private cache: CacheService) { }

    async invalidateForRoute(route: RouteConfig) {
        for (const inv of route.invalidates) {
            await this.cache.softInvalidateByRoute(inv.targetRouteId, route.ttl);
        }
    }
}
