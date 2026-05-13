# API Plan

## Goal
Build `apps/api` as Whooper's control-plane service.

The API owns Whooper's Postgres metadata database and exposes routes to configure projects, proxy routes, cache behavior, database event sources, and cache invalidation mappings.

Whooper will support:
- Whooper internal database: Postgres only.
- User database sources: Postgres and MongoDB only.
- Runtime cache: Redis.
- No SaaS-style API keys in v1.

## Service Responsibilities
```txt
API
  -> writes Whooper config into Whooper Postgres
  -> manages projects, routes, event sources, and mappings
  -> sends config reload notifications

Engine
  -> reads route config from Whooper Postgres
  -> proxies and caches HTTP requests
  -> stores cached responses in Redis

Events Engine
  -> reads source and mapping config from Whooper Postgres
  -> listens to user Postgres or MongoDB changes
  -> invalidates matching cache entries in Redis
```

## Health Routes
| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Confirms the API service is running. |

## Project Routes
Projects isolate route config, cache keys, event sources, and invalidation mappings.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/projects` | Create a project namespace. |
| `GET` | `/projects` | List projects. |
| `GET` | `/projects/:projectId` | Get one project. |
| `PATCH` | `/projects/:projectId` | Update project details. |
| `DELETE` | `/projects/:projectId` | Delete a project and its Whooper config. |

## Proxy Route Config
Proxy routes tell the engine what requests it can match, proxy, cache, and revalidate.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/projects/:projectId/routes` | Create an engine route. |
| `GET` | `/projects/:projectId/routes` | List project routes. |
| `GET` | `/projects/:projectId/routes/:routeId` | Get one route config. |
| `PATCH` | `/projects/:projectId/routes/:routeId` | Update method, path, origin, TTL, cache mode, or auth mode. |
| `DELETE` | `/projects/:projectId/routes/:routeId` | Delete a route config. |

Route input:
```ts
type RouteConfigInput = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  originBase: string;
  ttlSeconds: number;
  authType: "none" | "jwt";
  cacheMode: "none" | "global";
};
```

## Event Source Routes
Event sources are user databases that events-engine can listen to for cache invalidation.

Only these source types are supported in v1:
```ts
type EventSourceType = "postgres" | "mongodb";
```

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/projects/:projectId/event-sources` | Register a user database source. |
| `GET` | `/projects/:projectId/event-sources` | List project database sources. |
| `GET` | `/projects/:projectId/event-sources/:sourceId` | Get one source config. |
| `PATCH` | `/projects/:projectId/event-sources/:sourceId` | Update source config. |
| `DELETE` | `/projects/:projectId/event-sources/:sourceId` | Remove source config. |

Event source input:
```ts
type EventSourceInput = {
  type: "postgres" | "mongodb";
  name: string;
  connectionUrl: string;
  enabled: boolean;
};
```

## Entity Mapping Routes
Mappings tell events-engine which cached routes should be invalidated when a database entity changes.

For Postgres, `entity` means table name.
For MongoDB, `entity` means collection name.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/projects/:projectId/event-sources/:sourceId/mappings` | Map a DB entity to cached routes. |
| `GET` | `/projects/:projectId/event-sources/:sourceId/mappings` | List mappings for one source. |
| `DELETE` | `/projects/:projectId/event-sources/:sourceId/mappings/:mappingId` | Delete one mapping. |

Mapping input:
```ts
type MappingInput = {
  entity: string;
  targetRouteIds: string[];
};
```

Example:
```txt
source: user Postgres
entity: products
target routes:
  - GET /products
  - GET /products/:id
```

## Manual Cache Invalidation
Manual invalidation is useful for debugging, admin actions, or applications that want to trigger invalidation directly.

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/projects/:projectId/cache/invalidate` | Manually invalidate one or more routes. |

Manual invalidation input:
```ts
type ManualInvalidateInput = {
  routeIds: string[];
};
```

## Config Reload Behavior
After creating, updating, or deleting config, the API should notify other services through Postgres `NOTIFY`.

```txt
API changes route config
  -> NOTIFY gateway_config_changed
  -> engine reloads routes

API changes event source or mapping config
  -> NOTIFY events_config_changed
  -> events-engine reloads watchers and mappings
```

## What This Achieves
- Projects provide isolation for config, cache keys, sources, and mappings.
- Routes give engine enough data to proxy and cache requests.
- Event sources give events-engine the user databases to watch.
- Mappings connect user DB changes to cache invalidation.
- Manual invalidation gives a fallback when automatic invalidation is not enough.
- API remains the only service that writes Whooper configuration.

## Validation Rules
- Project child resources must always be scoped by `projectId`.
- Event sources must only accept `postgres` or `mongodb`.
- Mappings must reject unknown `sourceId` values.
- Mappings must reject `targetRouteIds` outside the same project.
- Route paths and methods must be valid for engine matching.
- Cache invalidation must reject route IDs outside the project.

## V1 Test Scenarios
- `GET /health` returns API running status.
- Project CRUD creates and scopes project-owned resources.
- Route CRUD writes engine-readable config.
- Event source CRUD accepts Postgres and MongoDB only.
- Mapping CRUD connects one DB entity to one or more project routes.
- Manual invalidation accepts valid project route IDs.
- Config writes trigger the correct Postgres notification.

## Assumptions
- Whooper metadata DB is Postgres only.
- User DB source support is limited to Postgres and MongoDB.
- Redis is shared by engine and events-engine.
- No built-in SaaS auth or API-key system in v1.
- The API is a self-hosted admin/control-plane service and should usually be protected by the user's infrastructure.
