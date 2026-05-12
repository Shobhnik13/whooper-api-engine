# Engine Request Flow

This document explains how a request travels through the engine, which files are involved, and which functions/classes are called in order.

## 1. Engine Startup Flow

Before any request can be handled, the engine starts from:

```txt
apps/engine/server.ts
```

Startup order:

1. `server.ts` loads environment variables.
   - Uses `dotenv.config(...)`.
   - Reads the root `.env` file.

2. `server.ts` creates the Express app.
   - `const app = express()`

3. `server.ts` registers JSON middleware.
   - `app.use(express.json())`

4. `startServer()` is called.
   - File: `apps/engine/server.ts`
   - Function: `startServer`

5. `startServer()` checks the database connection.
   - Function called: `checkDb()`
   - File: `apps/engine/server.ts`

6. `checkDb()` creates a Drizzle database client.
   - Function called: `createDb(...)`
   - File: `apps/engine/db/drizzle.ts`

7. `createDb(...)` creates a Postgres pool and Drizzle client.
   - Creates `new Pool(...)`
   - Creates `drizzle({ client: pool })`
   - Returns:
     - `db`
     - `pool`
     - `ping()`
     - `close()`

8. `checkDb()` calls `database.ping()`.
   - File: `apps/engine/db/drizzle.ts`
   - Function: `ping`
   - Runs:

```ts
db.execute(sql`select 1`)
```

9. `startServer()` checks Redis.
   - Function called: `checkRedis()`
   - File: `apps/engine/server.ts`

10. `checkRedis()` creates Redis client.
    - Class: `RedisClient`
    - File: `apps/engine/redis/client.ts`

11. `checkRedis()` calls Redis ping.
    - Function: `redis.ping()`
    - File: `apps/engine/redis/client.ts`
    - Expected result:

```txt
PONG
```

12. `startServer()` registers the request interceptor.
    - Function called: `interceptRequests()`
    - File: `apps/engine/server.ts`

13. `interceptRequests()` registers this Express route:

```ts
app.all("/proxy/*", async (req, res) => {
    ...
})
```

14. `startServer()` starts the HTTP server.
    - Calls:

```ts
app.listen(port, ...)
```

At this point the engine can receive HTTP requests.

## 2. Current Implemented Request Flow

Current request entrypoint:

```txt
apps/engine/server.ts
```

Current request order:

1. Client sends request to:

```txt
/proxy/*
```

Example:

```txt
GET /proxy/api/v1/users
```

2. Express receives the request.
   - File: `apps/engine/server.ts`
   - Registered by: `interceptRequests()`

3. Express matches the request to:

```ts
app.all("/proxy/*", async (req, res) => {
    ...
})
```

4. The handler checks the API key header.
   - Header:

```txt
x-api-key
```

5. If `x-api-key` is missing, the engine returns:

```txt
401 Invalid API Key
```

6. If `x-api-key` exists, the current code stops there.

Important: the current `server.ts` does not yet call `GatewayHandler.handle(...)`. So right now, a valid API key request enters the route handler, passes the API-key check, and then no final response is sent.

## 3. Intended Full Request Flow

The rest of the engine already has classes for the full gateway flow, but they are not wired into `server.ts` yet.

The intended order is:

```txt
server.ts
  -> GatewayHandler.handle(...)
  -> RouteResolver
  -> AuthGuard
  -> CacheKeyBuilder
  -> CacheCoordinator
  -> CacheService / SingleFlight / OriginProxy
```

## 4. Intended Flow Step-by-Step

### Step 1: Request Enters Express

File:

```txt
apps/engine/server.ts
```

Function:

```ts
interceptRequests()
```

Expected responsibility:

- Receive every `/proxy/*` request.
- Check `x-api-key`.
- Find routes for that API key.
- Pass the request to `GatewayHandler.handle(...)`.

Expected future call:

```ts
handler.handle(req, res, routes)
```

### Step 2: Gateway Handler Cleans the Path

File:

```txt
apps/engine/gateway/handler.ts
```

Class:

```ts
GatewayHandler
```

Function:

```ts
handle(req, res, routes)
```

First internal service called:

```ts
RouteResolver.resolve(req, routes)
```

Example:

```txt
/proxy/api/v1/users -> /api/v1/users
```

### Step 3: Gateway Handler Matches Route Config

File:

```txt
apps/engine/gateway/routeResolver.ts
```

Code path:

```ts
const route = routes.find(r => r.method === req.method && r.matcher(cleanedPath))
```

It checks:

- HTTP method
- Path matcher

If no route matches:

```txt
404 Route not found
```

Route type is defined in:

```txt
apps/engine/config/types.ts
```

Interface:

```ts
RouteConfig
```

### Step 4: Gateway Handler Checks Route Auth

File:

```txt
apps/engine/gateway/authGuard.ts
```

Code checks:

```ts
req.headers.authorization
req.headers.cookie
route.authType
```

If route requires JWT auth and no auth header/cookie exists:

```txt
401 Authorization required
```

Important: current code only checks whether auth exists. It does not validate JWT yet.

### Step 5: Gateway Handler Builds Cache Key

File:

```txt
apps/engine/cache/cacheKeyBuilder.ts
```

Code:

```ts
CacheKeyBuilder.build(req, route, cleanedUrl)
```

Cache key format:

```txt
cache:<routeId>:<md5-route-method-url-hash>
```

Example:

```txt
cache:get-users:7ac66c0f148de9519b8bd264312c4d64
```

### Step 6A: If Cache Mode Is `none`

Coordinator file:

```txt
apps/engine/cache/cacheCoordinator.ts
```

Condition:

```ts
if (route.cacheMode === "none")
```

Flow:

1. Gateway forwards request to origin.
   - Class: `OriginProxy`
   - File: `apps/engine/proxy/origin.proxy.ts`
   - Function:

```ts
forward(req, route.origin, cleanedPath)
```

2. `OriginProxy.forward(...)` calls origin using `node-fetch`.

3. `CacheCoordinator` asks `InvalidationService` to process route invalidation rules.
   - File: `apps/engine/invalidate/invalidation.service.ts`
   - For each `route.invalidates`, it calls:

```ts
cache.softInvalidateByRoute(inv.targetRouteId, route.ttl)
```

4. `CacheService.softInvalidateByRoute(...)` scans Redis keys by route prefix.
   - File: `apps/engine/cache/cache.service.ts`

5. `CacheService` uses Redis wrapper.
   - File: `apps/engine/redis/client.ts`
   - Functions:

```ts
scanByPrefix(...)
set(...)
```

6. Gateway returns the origin response.

### Step 6B: If Cache Mode Is `global`

Coordinator file:

```txt
apps/engine/cache/cacheCoordinator.ts
```

Flow starts by reading cache:

```ts
const cached = await this.cache.getRaw(cacheKey)
```

Cache class:

```txt
apps/engine/cache/cache.service.ts
```

Redis wrapper:

```txt
apps/engine/redis/client.ts
```

## 5. Cache Hit Flow

Condition:

```ts
if (cached && !cached.invalidated)
```

Order:

1. `GatewayHandler.handle(...)`
2. `CacheCoordinator.handle(...)`
3. `CacheService.getRaw(cacheKey)`
4. `RedisClient.get(key)`
5. Return cached value

Response header:

```txt
X-Cache: HIT
```

Response body:

```ts
cached.current ?? cached.prev
```

## 6. Stale Cache Flow

Condition:

```ts
if (cached.invalidated)
```

Order:

1. `GatewayHandler.handle(...)` delegates to `CacheCoordinator`.
2. `CacheCoordinator.handle(...)` detects stale cache.
3. It tries to acquire a single-flight lock.
   - Class: `SingleFlight`
   - File: `apps/engine/cache/singleFlight.ts`
   - Function:

```ts
acquireLock(cacheKey)
```

4. `SingleFlight.acquireLock(...)` generates a unique token and calls:

```ts
RedisClient.setNX(...)
```

5. If this request becomes leader, `CacheCoordinator` asks `RevalidationService` to refresh in the background.

6. `RevalidationService.refreshInBackground(...)` calls:

```ts
OriginProxy.forward(req, route.origin, cleanedPath)
```

7. If origin returns `2xx`, cache is updated:

```ts
CacheService.set(cacheKey, r.body, route.ttl)
```

8. The Redis lock is released only if the token still matches.

9. Client immediately receives stale previous value.

Response header:

```txt
X-Cache: STALE
```

Response body:

```ts
cached.prev
```

## 7. Cache Miss Flow

Condition:

```ts
if (!cached)
```

Order:

1. `GatewayHandler.handle(...)` delegates to `CacheCoordinator`.
2. `CacheCoordinator.handle(...)` sees cache miss.
3. It calls:

```ts
SingleFlight.acquireLock(cacheKey)
```

4. `SingleFlight` generates a unique token and calls:

```ts
RedisClient.setNX(`lock:${cacheKey}`, token, 5)
```

5. If lock succeeds, request is leader.

Leader flow:

1. Call origin:

```ts
OriginProxy.forward(req, route.origin, cleanedPath)
```

2. If origin status is `2xx`, cache response:

```ts
CacheService.set(cacheKey, r.body, route.ttl)
```

3. Return origin response.

Response header:

```txt
X-Cache: MISS
```

Follower flow:

1. Poll cache for up to `1000ms`.
2. Check every `50ms`:

```ts
CacheService.get(cacheKey)
```

3. If cache now exists, return it.

Response header:

```txt
X-Cache: FOLLOWER
```

4. If cache still does not exist, return:

```txt
503 Service busy
```

## 8. Origin Proxy Flow

File:

```txt
apps/engine/proxy/origin.proxy.ts
```

Class:

```ts
OriginProxy
```

Function:

```ts
forward(req, origin, path)
```

Order:

1. Builds final origin URL:

```ts
origin + path
```

2. Sends request with `node-fetch`.

3. Uses original request method:

```ts
method: req.method
```

4. For non-GET and non-HEAD requests, forwards request body.

5. JSON object bodies are stringified before forwarding.

6. Gateway-only and hop-by-hop headers are stripped.

7. Origin calls have a timeout.

8. Reads origin response as text:

```ts
await res.text()
```

9. Returns:

```ts
{
    status: res.status,
    body: await res.text(),
    headers
}
```

## 9. Redis Flow

File:

```txt
apps/engine/redis/client.ts
```

Class:

```ts
RedisClient
```

Used by:

- `CacheService`
- `SingleFlight`
- `server.ts` startup Redis ping

Important functions:

```ts
get(key)
set(key, val, ttl)
del(keys)
scanByPrefix(prefix)
ping()
setNX(key, val, ttl)
releaseLock(key, token)
```

`releaseLock(...)` uses a Lua script so it only deletes the lock if the stored token matches the caller's token.

## 10. Config Flow

```txt
apps/engine/config/loader.ts
```

Function:

```ts
loadConfig()
```

Current behavior:

```ts
return new Map();
```

That means config loading is still a placeholder.

Intended behavior:

1. Read projects and routes from Postgres.
2. Compile route paths into matchers.
3. Build:

```ts
Map<string, RouteConfig[]>
```

Where:

- key = API key
- value = routes available to that API key

## 11. Config Reload Flow

File:

```txt
apps/engine/db/listen.ts
```

Function:

```ts
startConfigListener(dbUrl, onReload)
```

Intended order:

1. Create Postgres client.
2. Connect to DB.
3. Run:

```sql
LISTEN gateway_config_changed
```

4. When Postgres sends notification:

```ts
loadConfig()
```

5. Pass new config to:

```ts
onReload(cfg)
```

Current status: this listener exists but is not wired into `server.ts`.

## 12. Complete Intended Call Order

This is the final intended request flow after wiring is completed:

```txt
Client
  -> apps/engine/server.ts
     -> Express app
     -> interceptRequests()
     -> app.all("/proxy/*")
     -> x-api-key check
     -> route config lookup by API key
     -> apps/engine/gateway/handler.ts
        -> GatewayHandler.handle(req, res, routes)
        -> RouteResolver.resolve(req, routes)
           -> clean /proxy path and URL
           -> route matcher check
        -> AuthGuard.verify(req, route)
        -> CacheKeyBuilder.build(req, route, cleanedUrl)
        -> CacheCoordinator.handle(req, route, cleanedUrl, cacheKey)
           -> apps/engine/cache/cache.service.ts
              -> CacheService.getRaw(cacheKey)
              -> apps/engine/redis/client.ts
                 -> RedisClient.get(cacheKey)
           -> if cache hit
              -> return cached response
           -> if cache stale
              -> apps/engine/cache/singleFlight.ts
                 -> SingleFlight.acquireLock(cacheKey)
                 -> RedisClient.setNX(lock key, token, ttl)
              -> apps/engine/cache/revalidation.service.ts
                 -> RevalidationService.refreshInBackground(...)
              -> return stale response immediately
           -> if cache miss
              -> SingleFlight.acquireLock(cacheKey)
              -> if leader
                 -> apps/engine/proxy/origin.proxy.ts
                    -> OriginProxy.forward(req, origin, cleanedUrl)
                 -> CacheService.set(cacheKey, body, ttl)
                 -> RedisClient.set(cacheKey, value, ttl)
                 -> SingleFlight.releaseLock(lock)
                 -> return origin response
              -> if follower
                 -> poll cache up to 1000ms
                 -> CacheService.get(cacheKey)
                 -> return cached response or 503
           -> if route cacheMode is none
              -> OriginProxy.forward(req, origin, cleanedUrl)
              -> apps/engine/invalidate/invalidation.service.ts
                 -> InvalidationService.invalidateForRoute(route)
              -> CacheService.softInvalidateByRoute(...)
              -> RedisClient.scanByPrefix(...)
              -> RedisClient.set(...)
              -> return origin response
        -> GatewayHandler.send(res, response)
```

## 13. Current Missing Wiring

These parts exist but are not connected yet:

1. `GatewayHandler` is not created in `server.ts`.
2. `CacheService` is not created in `server.ts`.
3. `SingleFlight` is not created in `server.ts`.
4. `OriginProxy` is not created in `server.ts`.
5. `loadConfig()` returns an empty map.
6. `startConfigListener()` is not called.
7. Valid API-key requests do not yet call:

```ts
GatewayHandler.handle(req, res, routes)
```

So the current real flow stops after the API-key check in `server.ts`.
