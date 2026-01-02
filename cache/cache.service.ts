import { RedisClient } from "../redis/client";

export class CacheService {
    constructor(private redis: RedisClient) { }

    get(key: string) {
        return this.redis.get(key);
    }

    set(key: string, val: string, ttl: number) {
        return this.redis.set(key, val, ttl);
    }
}
