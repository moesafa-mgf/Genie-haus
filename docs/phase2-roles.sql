-- Phase 2: workspace roles and permissions
-- Run after phase1-workspaces.sql

CREATE TABLE IF NOT EXISTS workspace_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup for a user's role within a workspace
CREATE UNIQUE INDEX IF NOT EXISTS ux_workspace_roles_unique
  ON workspace_roles (location_id, workspace_id, user_email);

-- Convenience index for listing per workspace
CREATE INDEX IF NOT EXISTS idx_workspace_roles_ws
  ON workspace_roles (workspace_id)
  WHERE role IN ('admin','manager','member');
