import fetch from "node-fetch";

export class OriginProxy {
    async forward(req: any, origin: string, path: string) {
        const res = await fetch(origin + path, {
            method: req.method,
            headers: req.headers,
            body: ["GET", "HEAD"].includes(req.method) ? null : req.body
        })

        return {
            status: res.status,
            body: await res.text()
        }
    }
}