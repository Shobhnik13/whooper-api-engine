import { RouteConfig } from "../config/types";

export interface ResolvedRoute {
    route: RouteConfig;
    cleanedPath: string;
    cleanedUrl: string;
}

export class RouteResolver {
    resolve(req: any, routes: RouteConfig[]): ResolvedRoute | null {
        const cleanedPath = this.cleanIncomingPath(req.path);
        const cleanedUrl = this.cleanIncomingUrl(req.originalUrl || req.url || req.path);
        const route = routes.find(r => r.method === req.method && r.matcher(cleanedPath));

        if (!route) return null;

        return {
            route,
            cleanedPath,
            cleanedUrl
        };
    }

    private cleanIncomingPath(path: string) {
        return path.replace(/^\/proxy/, "");
    }

    private cleanIncomingUrl(url: string) {
        return url.replace(/^\/proxy/, "");
    }
}
