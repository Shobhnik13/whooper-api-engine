import crypto from "crypto";
import { RouteConfig } from "../config/types";

export class CacheKeyBuilder {
    build(req: any, route: RouteConfig, cleanedUrl: string) {
        const source = [
            route.routeId,
            req.method,
            cleanedUrl
        ].join(":");

        return "cache:" + route.routeId + ":" + crypto.createHash("md5").update(source).digest("hex");
    }
}
