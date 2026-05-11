import dotenv from "dotenv"
import fs from "fs"
import path from "path"

const envPath = process.env.DOTENV_CONFIG_PATH
    || [
        path.resolve(__dirname, "../../.env"),
        path.resolve(__dirname, "../../../.env"),
        path.resolve(process.cwd(), ".env"),
    ].find(fs.existsSync)

dotenv.config({
    path: envPath
})

import express from 'express';
import { createDb } from './db/drizzle';
import { logger } from './logger';
import { RedisClient } from './redis/client';
const app = express()

let database: ReturnType<typeof createDb> | null = null;

// middleware
app.use(express.json())

const checkDb = async () => {
    try {
        database = createDb(process.env.DATABASE_URL!);
        await database.ping();
        logger.info('Database connected successfully.')
    } catch (err) {
        logger.error({ err }, "Database connection failed");
        if (database) {
            await database.close().catch(closeErr => {
                logger.warn({ err: closeErr }, "Failed to close database connection after failed ping");
            });
            database = null;
        }
        throw new Error("Failed to connect to database");
    }
}

const checkRedis = async () => {
    try {
        const redis = new RedisClient(process.env.REDIS_URL!);
        const redisPing = await redis.ping();

        if (redisPing !== "PONG") {
            throw new Error(`Redis ping failed: ${redisPing}`)
        }

        logger.info('Redis connected successfully.')
    } catch (err) {
        logger.error({ err }, "Redis connection failed");
        throw new Error("Failed to connect to Redis");
    }
}

const interceptRequests = () => {
    app.all("/proxy/*", async (req, res) => {
        try {
            //     // as we intercept the request 
            //     // so before checking auth, caching, innvalidation and forwarding to origin
            //     // we will check is this route exists in our config
            //     // basically we will match the api key of this request and will match is this api key has this route configured

            const apiKey = req.headers['x-api-key'] as string
            if (!apiKey) {
                return res.status(401).send("Invalid API Key")
            }
            // if available then give this req to handler for further processing
        } catch (err) {
            logger.error({ err }, "Unhandled proxy request error");
            return res.status(500).send("Internal server error")
        }
    })

}

const startServer = async () => {
    const port = process.env.ENGINE_PORT!;

    // db connection
    await checkDb();

    // redis connection
    await checkRedis();

    // config load in memory 
    // listener that updates config on db listen 
    // TODO


    // injecting redis to diff services
    // dependency injection container setup
    // TODO

    // intercepting requests
    interceptRequests();

    // start server
    app.listen(port, () => {
        logger.info(`Server is running on port ${port}`);
    })
}

startServer().catch((err) => {
    logger.fatal({ err }, "Failed to start server");
    process.exit(1);
})

process.on("unhandledRejection", (err) => {
    logger.error({ err }, "Unhandled promise rejection");
})

process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "Uncaught exception");
    process.exit(1);
})
