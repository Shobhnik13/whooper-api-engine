import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export const createDb = (connectionString: string) => {
    const pool = new Pool({
        connectionString,
    });

    const db = drizzle({ client: pool });

    return {
        db,
        pool,
        async ping() {
            await db.execute(sql`select 1`);
        },
        close() {
            return pool.end();
        }
    };
};
