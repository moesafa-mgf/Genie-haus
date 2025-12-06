# Phase 2 quick seeds / checks

## Seed snippet (Postgres)
```sql
-- workspace with emoji icon
INSERT INTO workspaces (id, location_id, name, icon_url, created_by)
VALUES ('ws_seed_demo', 'your-location-id', 'Demo Workspace', '🚀', 'demo@example.com')
ON CONFLICT (id) DO NOTHING;

-- roles for two users
INSERT INTO workspace_roles (workspace_id, location_id, user_email, role)
VALUES
  ('ws_seed_demo', 'your-location-id', 'admin@example.com', 'admin'),
  ('ws_seed_demo', 'your-location-id', 'member@example.com', 'member')
ON CONFLICT DO NOTHING;
```

## Smoke-test checklist
- PATCH /api/workspaces?id=ws_seed_demo with `{ "iconUrl": "📌" }` returns 200 and updates `icon_url`.
- Role changes via `/api/workspace-roles` reflect immediately in the chooser (admin-only visibility respected).
- Workspace chooser tiles show the emoji icon after a reload.
