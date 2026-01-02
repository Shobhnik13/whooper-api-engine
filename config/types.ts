import { MatchFunction } from "path-to-regexp";

export interface InvalidationRule {
    targetRouteId: string;
}

export interface RouteConfig {
    routeId: string;
    method: string;
    matcher: MatchFunction<any>

    origin: string;
    ttl: number; // in seconds

    authType: "none" | "jwt"
    cacheMode: "none" | "global"
    invalidates: InvalidationRule[]
}