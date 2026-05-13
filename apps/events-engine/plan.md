# Events Engine Plan

## Goal
Build `events-engine` as the database-change listener for Whooper. It watches user databases, converts database-specific change events into one common invalidation event, and invalidates cached routes in Redis.

## Core Flow
```txt
User DB changes
  -> DB adapter receives change
  -> adapter normalizes event
  -> events-engine finds mapped routes
  -> Redis cache is soft-invalidated
  -> next engine request serves stale and refreshes
```

## Event Contract
```ts
type InvalidationEvent = {
  projectId: string;
  sourceId: string;
  entity: string;
  operation: "insert" | "update" | "delete" | "unknown";
  recordId?: string;
};
```

## Adapter Strategy
- MongoDB: use Change Streams.
- Postgres: use LISTEN/NOTIFY with triggers or app-emitted notifications.
- MySQL: start with generic webhook/manual events; add binlog adapter later.
- SQLite: use app hook/manual events because SQLite has no always-on server event stream.
- Generic SQL: support webhook/manual invalidation events.

## V1 Scope
- Create event source abstraction.
- Implement MongoDB adapter.
- Implement Postgres NOTIFY adapter.
- Implement generic webhook/manual adapter.
- Add mapping lookup from `sourceId + entity` to route IDs.
- Soft-invalidate Redis cache by project and route.

## Cache Key Direction
Use project-scoped keys:

```txt
cache:{projectId}:{routeId}:{hash}
```

This prevents route ID collisions across projects and lets events invalidate only one project's cache.

## User Flow
1. User creates a project.
2. User configures cached routes.
3. User connects a database source.
4. User maps DB entities to cached routes.
5. Database changes happen.
6. Events engine receives change events.
7. Matching route cache is invalidated automatically.

## Assumptions
- No Debezium or Redpanda in v1.
- No DB polling.
- API layer owns source config and mappings.
- Engine remains responsible for proxy/cache request flow.
- Events engine is responsible for DB-change-driven invalidation.
