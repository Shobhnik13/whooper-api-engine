# Client Plan

## Goal
Build `apps/client` as a minimal web UI for managing Whooper through the API service.

The client should not implement authentication, protected routes, teams, billing, SaaS account flows, or complex admin controls in v1. It should be a simple self-hosted control panel that talks to `apps/api` and lets the user configure Whooper.

## Service Role
```txt
Client
  -> calls API routes
  -> shows projects, routes, event sources, and mappings
  -> gives users simple forms for configuration

API
  -> validates requests
  -> writes config to Whooper Postgres
  -> notifies engine and events-engine
```

The client should not connect directly to Postgres, Redis, engine, events-engine, or user databases.

## Environment
```env
CLIENT_PORT=3000
API_BASE_URL=http://localhost:3001
```

## Pages

### Home / Project List
Route:
```txt
/
```

Purpose:
- Show all projects.
- Create a new project.
- Open a project workspace.

API usage:
- `GET /projects`
- `POST /projects`

### Project Overview
Route:
```txt
/projects/:projectId
```

Purpose:
- Show project summary.
- Show route count, event source count, and mapping count.
- Provide navigation to routes, sources, mappings, and manual invalidation.

API usage:
- `GET /projects/:projectId`
- `GET /projects/:projectId/routes`
- `GET /projects/:projectId/event-sources`

### Routes
Route:
```txt
/projects/:projectId/routes
```

Purpose:
- List proxy/cache routes.
- Create route.
- Edit route.
- Delete route.

Fields:
```ts
type RouteForm = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  originBase: string;
  ttlSeconds: number;
  authType: "none" | "jwt";
  cacheMode: "none" | "global";
};
```

API usage:
- `GET /projects/:projectId/routes`
- `POST /projects/:projectId/routes`
- `PATCH /projects/:projectId/routes/:routeId`
- `DELETE /projects/:projectId/routes/:routeId`

### Event Sources
Route:
```txt
/projects/:projectId/event-sources
```

Purpose:
- List connected user databases.
- Add Postgres or MongoDB source.
- Enable or disable a source.
- Delete a source.

Fields:
```ts
type EventSourceForm = {
  type: "postgres" | "mongodb";
  name: string;
  connectionUrl: string;
  enabled: boolean;
};
```

API usage:
- `GET /projects/:projectId/event-sources`
- `POST /projects/:projectId/event-sources`
- `PATCH /projects/:projectId/event-sources/:sourceId`
- `DELETE /projects/:projectId/event-sources/:sourceId`

### Entity Mappings
Route:
```txt
/projects/:projectId/event-sources/:sourceId/mappings
```

Purpose:
- Show mappings for one database source.
- Map a Postgres table or MongoDB collection to one or more cached routes.
- Delete mappings.

Fields:
```ts
type MappingForm = {
  entity: string;
  targetRouteIds: string[];
};
```

API usage:
- `GET /projects/:projectId/event-sources/:sourceId/mappings`
- `POST /projects/:projectId/event-sources/:sourceId/mappings`
- `DELETE /projects/:projectId/event-sources/:sourceId/mappings/:mappingId`
- `GET /projects/:projectId/routes`

### Manual Invalidation
Route:
```txt
/projects/:projectId/cache`
```

Purpose:
- Select one or more routes.
- Trigger manual cache invalidation.
- Show success or failure response.

Fields:
```ts
type ManualInvalidateForm = {
  routeIds: string[];
};
```

API usage:
- `GET /projects/:projectId/routes`
- `POST /projects/:projectId/cache/invalidate`

## UI Behavior
- Keep the UI minimal and form-first.
- Use tables for lists.
- Use dialogs or inline panels for create/edit forms.
- Show loading, empty, success, and error states.
- Do not add login, signup, sessions, RBAC, or API keys.
- Do not expose raw database credentials after save unless the API returns them.
- Do not call engine proxy routes from the client.

## What This Achieves
- Users can configure Whooper without editing the database manually.
- Users can create projects, routes, event sources, and mappings.
- Users can manually invalidate cache when needed.
- The UI remains small enough for a self-hosted open-source v1.
- API remains the only source of truth for validation and persistence.

## V1 Test Scenarios
- Project list loads from the API.
- A project can be created and opened.
- Routes can be created, updated, and deleted.
- Event sources can be created for Postgres and MongoDB only.
- Entity mappings can connect one source entity to one or more routes.
- Manual invalidation can submit selected route IDs.
- API errors are shown clearly in the UI.

## Assumptions
- Client is not auth-protected in v1.
- API is protected by the user's local network, reverse proxy, or infrastructure if needed.
- Client only talks to `apps/api`.
- Client does not directly manage Redis, Postgres, MongoDB, engine, or events-engine.
