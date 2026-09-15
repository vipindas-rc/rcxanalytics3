CREATE TABLE IF NOT EXISTS rcx_data.analytics_workspace (
  workspace_id smallint PRIMARY KEY CHECK (workspace_id = 1),
  revision bigint NOT NULL DEFAULT 0,
  workspace jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);