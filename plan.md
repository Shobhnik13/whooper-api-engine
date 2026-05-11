# Whooper Monorepo Plan

## Current Repository Shape

The repository is now organized as a Turborepo-style npm workspace:

```txt
apps/
  engine/     Existing API gateway/cache engine
  api/        Future control-plane API workspace
  frontend/   Future management UI workspace
```

The current real implementation lives in `apps/engine`. The `apps/api` and `apps/frontend` workspaces are intentionally minimal placeholders so the repository has the right long-term shape without pretending those products already exist.

## Environment Strategy

The monorepo uses one shared `.env` file at the repository root. The real `.env` stays ignored by git, and `.env.example` documents the variables each app expects.

Current engine variables:

- `REDIS_URL`: Redis connection string used by `apps/engine`.
- `DB_URL`: Postgres connection string used by `apps/engine`.
- `ENGINE_PORT`: HTTP port used by `apps/engine`.
- `LOG_LEVEL`: Pino log level used by `apps/engine`.

Current API variables:

- `API_PORT`: HTTP port used by `apps/api`.

Current frontend variables:

- `FRONTEND_PORT`: HTTP port used by `apps/frontend`.

`apps/engine/server.ts` loads the root `.env` by default. For special deployments, `DOTENV_CONFIG_PATH` can point the engine at another env file.

## Phase 1: Complete the Engine Runtime

### Wire the Gateway Handler

Goal: connect the already-written gateway logic to the Express `/proxy/*` route.

What it achieves:

- Requests with valid API keys can flow into `GatewayHandler`.
- Route matching, cache reads, origin forwarding, and invalidation can actually run.
- The engine becomes testable as a working gateway rather than a startup shell.

### Implement Config Loading

Goal: implement `loadConfig()` using the existing Postgres route queries.

What it achieves:

- Route behavior can be loaded from the database.
- API keys can map to project-specific route lists.
- Path strings can be compiled into route matchers.
- The gateway can operate from data instead of hardcoded routes.

### Start Config Reload Listener

Goal: wire `startConfigListener()` into engine startup.

What it achieves:

- Route config can update without restarting the engine.
- Multiple engine instances can receive the same Postgres notification.
- The architecture becomes suitable for dynamic route management.

### Fix Origin Proxy Semantics

Goal: make proxying behave correctly for real HTTP traffic.

What it achieves:

- JSON request bodies are forwarded correctly.
- Query strings reach the origin.
- Gateway-only headers can be stripped.
- Important origin response headers can be preserved.
- The engine becomes safer for real API traffic.

## Phase 2: Make Caching Correct

### Query-Aware Cache Keys

Goal: include query strings in cache keys.

What it achieves:

- `GET /users?page=1` and `GET /users?page=2` no longer collide.
- Cached responses become correct for basic API listing/filtering patterns.

### Configurable Cache Key Policy

Goal: let each route define which request parts affect the cache key.

What it achieves:

- Public routes can cache globally.
- Tenant-aware routes can include tenant identity.
- Header-sensitive routes can vary on selected headers.
- The engine avoids returning private or incorrect data from cache.

### Route Key Indexes

Goal: replace Redis prefix scans with per-route cache key indexes.

What it achieves:

- Invalidation becomes predictable as cache volume grows.
- Large route caches can be invalidated without scanning Redis broadly.
- The engine becomes more production-friendly.

### Stale-if-Error

Goal: serve the previous cached response when origin refresh fails.

What it achieves:

- Temporary origin failures do not immediately break clients.
- The cache becomes a resilience layer, not only a speed layer.

## Phase 3: Security and Control

### Real JWT Validation

Goal: replace auth-header presence checks with real token validation.

What it achieves:

- Protected routes actually verify caller identity.
- Expired, malformed, or incorrectly issued tokens can be rejected.
- Route-level claims and scopes become possible.

### API Key Hardening

Goal: treat API keys as sensitive credentials.

What it achieves:

- Keys can be hashed at rest.
- Keys can be rotated safely.
- Lost or leaked keys can be revoked.
- Open-source users get a safer default pattern.

### Rate Limiting

Goal: add per-project and per-route request limits.

What it achieves:

- Origins are protected from abusive clients.
- Free/open-source deployments can enforce fair usage.
- The engine can become useful in shared environments.

## Phase 4: Build the API Workspace

### Project Management API

Goal: expose CRUD endpoints for projects and API keys.

What it achieves:

- Users can create projects without touching the database manually.
- API keys can be managed through a supported interface.
- The engine gets a real control plane.

### Route Management API

Goal: expose CRUD endpoints for gateway routes.

What it achieves:

- Users can add or change proxied routes.
- Cache TTL, auth type, origin, and invalidation rules can be managed.
- Config changes can publish `gateway_config_changed` notifications.

### Cache Control API

Goal: expose purge and invalidation endpoints.

What it achieves:

- Users can clear stale or incorrect cache entries manually.
- Admin tooling can trigger invalidation safely.
- The frontend has a clean backend surface.

## Phase 5: Build the Frontend Workspace

### Project Dashboard

Goal: show configured projects, API keys, and active route counts.

What it achieves:

- Operators can understand gateway setup at a glance.
- New users can configure the system without reading database tables.

### Route Editor

Goal: provide a UI for creating and editing gateway routes.

What it achieves:

- Route config becomes approachable for open-source users.
- TTL, cache mode, auth mode, and origin settings can be changed safely.
- Validation can prevent broken config before publish.

### Cache and Traffic View

Goal: show cache hit/miss/stale behavior and route traffic.

What it achieves:

- Users can see whether caching is working.
- Bad cache policies become easier to detect.
- The project becomes more useful as an operational tool.

## Phase 6: Open-Source Readiness

### Documentation

Goal: add setup, configuration, deployment, and contribution docs.

What it achieves:

- New users can run the project locally.
- Contributors can understand the monorepo layout.
- The project becomes easier to evaluate and adopt.

### Docker Compose

Goal: provide local Postgres, Redis, engine, API, and frontend services.

What it achieves:

- Users can start the full stack with one command.
- Development setup becomes repeatable.
- Open-source demos become practical.

### Example Origin Service

Goal: add a tiny sample service behind the gateway.

What it achieves:

- Users can test proxying, caching, and invalidation immediately.
- Documentation can use real commands and responses.
- New contributors get a reliable test target.

### Tests and CI

Goal: add unit tests, integration tests, and GitHub Actions.

What it achieves:

- Contributors can change the engine with confidence.
- Pull requests can be checked automatically.
- The project looks maintainable to open-source users.

### Templates and Examples

Goal: provide example route configs and deployment recipes.

What it achieves:

- Users can copy common gateway patterns.
- The project can support common use cases faster.
- Adoption friction drops.

## Recommended Build Order

1. Finish engine wiring.
2. Implement database config loading.
3. Correct proxy and cache key behavior.
4. Add focused tests around engine behavior.
5. Add the API control plane.
6. Add the frontend management UI.
7. Package the full stack with Docker Compose.
8. Add open-source docs, examples, and CI.
