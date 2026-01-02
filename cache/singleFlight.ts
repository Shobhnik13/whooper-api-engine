import { RedisClient } from "../redis/client";

// used in leader election and to prevent cache stampede
export class singleFlight {
    constructor(private redis: RedisClient) { }

    acquireLock(key: string): Promise<boolean> {
        return this.redis.setNX(`lock:${key}`, "1", 5) // lock expires in 5 seconds
    }
}