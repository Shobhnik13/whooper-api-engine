import crypto from "crypto";
import { RedisClient } from "../redis/client";

export interface SingleFlightLock {
    acquired: boolean;
    key: string;
    token?: string;
}

// used in leader election and to prevent cache stampede
export class SingleFlight {
    constructor(private redis: RedisClient) { }

    async acquireLock(key: string, ttl = 5): Promise<SingleFlightLock> {
        const lockKey = `lock:${key}`;
        const token = crypto.randomUUID();
        const acquired = await this.redis.setNX(lockKey, token, ttl);

        return {
            acquired,
            key: lockKey,
            token: acquired ? token : undefined
        };
    }

    async releaseLock(lock: SingleFlightLock) {
        if (!lock.acquired || !lock.token) return false;
        return this.redis.releaseLock(lock.key, lock.token);
    }
}
