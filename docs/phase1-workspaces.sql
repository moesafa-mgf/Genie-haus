-- Phase 1: multi-workspace schema
-- Safe to run multiple times; uses IF NOT EXISTS guards.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

-- Index to scope queries per GHL location
CREATE INDEX IF NOT EXISTS idx_workspaces_location_active
  ON workspaces (location_id)
  WHERE archived_at IS NULL;

-- Keep existing workspace_states table; ensure unique constraint exists
ALTER TABLE IF EXISTS workspace_states
  ADD CONSTRAINT IF NOT EXISTS workspace_states_loc_ws UNIQUE (location_id, workspace_id);
