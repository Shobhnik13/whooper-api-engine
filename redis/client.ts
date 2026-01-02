import Redis, { Command } from "ioredis";

export class RedisClient {
    private r: Redis;

    constructor(url: string) {
        this.r = new Redis(url, {
            enableReadyCheck: false,
        });
    }

    get(key: string) { return this.r.get(key); }

    set(key: string, val: string, ttl: number) {
        return this.r.set(key, val, "EX", ttl);
    }

    del(keys: string[]) { return keys.length ? this.r.del(...keys) : 0; }

    async scanByPrefix(prefix: string): Promise<string[]> {
        let cursor = "0"; const out: string[] = [];
        do {
            const [c, keys] = await this.r.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
            cursor = c; out.push(...keys);
        } while (cursor !== "0");
        return out;
    }

    async setNX(key: string, val: string, ttl: number): Promise<boolean> {
        const res = await this.r.sendCommand(
            new Command("SET", [key, val, "NX", "EX", ttl.toString()])
        );
        return res === "OK";
    }
}
