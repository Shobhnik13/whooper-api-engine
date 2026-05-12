import fetch from "node-fetch";

const ORIGIN_TIMEOUT_MS = 10000;
const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
    "x-api-key"
]);

export class OriginProxy {
    async forward(req: any, origin: string, path: string) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), ORIGIN_TIMEOUT_MS);

        const body = ["GET", "HEAD"].includes(req.method)
            ? undefined
            : this.buildBody(req);

        const headers = this.buildHeaders(req);

        const res = await fetch(origin + path, {
            method: req.method,
            headers,
            body,
            signal: controller.signal
        }).finally(() => clearTimeout(timeout));

        return {
            status: res.status,
            body: await res.text(),
            headers: this.responseHeaders(res)
        }
    }

    private buildBody(req: any) {
        if (req.body === undefined || req.body === null) return undefined;
        if (typeof req.body === "string" || Buffer.isBuffer(req.body)) return req.body;
        return JSON.stringify(req.body);
    }

    private buildHeaders(req: any) {
        const headers: Record<string, string> = {};

        for (const [key, value] of Object.entries(req.headers || {})) {
            const lower = key.toLowerCase();
            if (HOP_BY_HOP_HEADERS.has(lower)) continue;
            if (Array.isArray(value)) headers[key] = value.join(",");
            else if (typeof value === "string") headers[key] = value;
        }

        const hasContentType = Object.keys(headers).some(key => key.toLowerCase() === "content-type");
        if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) && !hasContentType) {
            headers["content-type"] = "application/json";
        }

        return headers;
    }

    private responseHeaders(res: any) {
        const out: Record<string, string> = {};

        for (const [key, value] of res.headers.entries()) {
            const lower = key.toLowerCase();
            if (lower === "content-type" || lower === "cache-control" || lower === "etag") {
                out[key] = value;
            }
        }

        return out;
    }
}
