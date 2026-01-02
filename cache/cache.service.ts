import { RedisClient } from "../redis/client";

export class CacheService {
    constructor(private r: RedisClient) { }

    get(k: string) { return this.r.get(k); }

    set(k: string, v: string, ttl: number) { return this.r.set(k, v, ttl); }

    async delByPrefix(prefix: string) {
        const keys = await this.r.scanByPrefix(prefix);
        await this.r.del(keys);
    }
}
