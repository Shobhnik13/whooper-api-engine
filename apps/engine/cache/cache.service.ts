import { CacheValue } from "../config/types";
import { RedisClient } from "../redis/client";

export class CacheService {
    constructor(private r: RedisClient) { }

    async getRaw(key: string): Promise<CacheValue | null> {
        const raw = await this.r.get(key);
        if (!raw) return null;

        const parsed: CacheValue = JSON.parse(raw);
        return parsed;
    }

    async get(key: string): Promise<string | null> {
        const raw = await this.getRaw(key);
        if (!raw) return null;

        return raw.current ?? raw.prev ?? null;
    }

    async set(key: string, body: string, ttl: number) {
        const raw = await this.getRaw(key)

        const next: CacheValue = {
            current: body,
            prev: raw?.current ?? raw?.prev ?? null,
            invalidated: false
        }
        await this.r.set(key, JSON.stringify(next), ttl);
    }


    async softInvalidateByRoute(routeId: string, ttl: number) {
        const prefix = `cache:${routeId}:`;
        const keys = await this.r.scanByPrefix(prefix);

        for (const key of keys) {
            const raw = await this.getRaw(key)
            if (!raw) continue;

            const next: CacheValue = {
                current: null,
                prev: raw.current ?? raw.prev ?? null,
                invalidated: true
            }
            await this.r.set(key, JSON.stringify(next), ttl);
        }
    }
}
