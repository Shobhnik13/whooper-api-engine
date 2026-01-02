import { RedisClient } from "../redis/client";

export class singleFlight {
    constructor(private redis: RedisClient) { }

    acquireLock(key: string): Promise<boolean> {
        return this.redis.setNX(`lock:${key}`, "1", 5) // lock expires in 5 seconds
    }
}