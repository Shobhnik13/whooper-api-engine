import Redis, { Command } from "ioredis";

export class RedisClient {
    private r: Redis;

    constructor(url: string) {
        this.r = new Redis(url);
    }

    get(key: string) {
        return this.r.get(key);
    }

    set(key: string, value: string, ttl: number) {
        return this.r.set(key, value, "EX", ttl);
    }

    async setNX(key: string, value: string, ttl: number): Promise<boolean> {
        const result = await this.r.sendCommand(
            new Command("SET", [key, value, "NX", "EX", ttl.toString()])
        );
        return result === "OK";
    }
}
