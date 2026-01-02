export const QUERIES = {
    PROJECTS: `
      SELECT id, api_key
      FROM projects
    `,

    ROUTES: `
      SELECT
        r.id,
        r.project_id,
        r.method,
        r.path,
        r.origin_base,
        r.ttl_seconds,
        r.auth_type,
        r.cache_mode,
        p.api_key
      FROM routes r
      JOIN projects p ON p.id = r.project_id
    `
};

