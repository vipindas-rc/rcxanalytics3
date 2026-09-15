CREATE TABLE IF NOT EXISTS rcx_data.agent_presence_intervals (
  dataset_id text NOT NULL,
  id text NOT NULL,
  batch_id uuid NOT NULL,
  agent_id text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  state text NOT NULL CHECK(state IN ('available', 'busy')),
  PRIMARY KEY(dataset_id, id),
  FOREIGN KEY(batch_id, dataset_id) REFERENCES rcx_data.batches(id, dataset_id),
  FOREIGN KEY(dataset_id, agent_id) REFERENCES rcx_data.agents(dataset_id, id),
  CHECK(ended_at > started_at)
);
CREATE INDEX IF NOT EXISTS agent_presence_scope ON rcx_data.agent_presence_intervals(dataset_id, started_at, ended_at);
