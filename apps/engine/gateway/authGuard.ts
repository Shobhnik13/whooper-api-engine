import { RouteConfig } from "../config/types";
import { GatewayResponse } from "./response";

export class AuthGuard {
    verify(req: any, route: RouteConfig): GatewayResponse | null {
        const hasAuth = !!req.headers.authorization || !!req.headers.cookie;

        if (!hasAuth && route.authType === "jwt") {
            return {
                status: 401,
                body: "Authorization required"
            };
        }

        return null;
    }
}
