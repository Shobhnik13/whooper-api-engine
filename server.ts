import dotenv from "dotenv"
dotenv.config()

import express from 'express';
import { sequelize } from './db/sequelize';
import { logger } from './logger';
import { RedisClient } from './redis/client';
const app = express()


// middleware
app.use(express.json())


const startServer = async () => {
    // db connection
    await sequelize.authenticate()
    logger.info('Database connected successfully.')

    // config load in memory 
    // listener that updates config on db listen 

    // redis client
    const redis = new RedisClient(process.env.REDIS_URL as string)
    if (redis) {
        logger.info('Redis connected successfully.')
    }

    // injecting redis to diff services
    // dependency injection container setup

    // intercepting every request rather than setting up individual routes
    app.all("/proxy/*", async (req, res) => {
        //     // as we intercept the request 
        //     // so before checking auth, caching, innvalidation and forwarding to origin
        //     // we will check is this route exists in our config
        //     // basically we will match the api key of this request and will match is this api key has this route configured

        const apiKey = req.headers['x-api-key'] as string
        if (!apiKey) {
            return res.status(401).json("Invalid API Key")
        }
        // if available then give this req to handler for further processing
    })

    app.listen(process.env.PORT, () => {
        logger.info(`Server is running on port ${process.env.PORT}`)
    })
}

startServer().catch(err => {
    logger.error({ err }, "Failed to start server");
})