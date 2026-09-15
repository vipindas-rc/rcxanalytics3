CREATE SCHEMA IF NOT EXISTS rcx_data;
CREATE TABLE IF NOT EXISTS rcx_data.datasets (
 id text PRIMARY KEY, seed bigint NOT NULL, generator_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rcx_data.batches (
 id uuid PRIMARY KEY, dataset_id text NOT NULL REFERENCES rcx_data.datasets(id), domain text NOT NULL,
 owner_day date NOT NULL, completed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(dataset_id,domain,owner_day), UNIQUE(id,dataset_id)
);
CREATE TABLE IF NOT EXISTS rcx_data.revisions (
 id uuid PRIMARY KEY, dataset_id text NOT NULL REFERENCES rcx_data.datasets(id), ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rcx_data.revision_batches (
 revision_id uuid NOT NULL REFERENCES rcx_data.revisions(id), batch_id uuid NOT NULL REFERENCES rcx_data.batches(id), PRIMARY KEY(revision_id,batch_id)
);
CREATE TABLE IF NOT EXISTS rcx_data.agents (
 dataset_id text NOT NULL REFERENCES rcx_data.datasets(id), id text NOT NULL, name text NOT NULL,
 agent_type text NOT NULL CHECK(agent_type IN ('ai','human')), PRIMARY KEY(dataset_id,id)
);
CREATE TABLE IF NOT EXISTS rcx_data.interactions (
 dataset_id text NOT NULL REFERENCES rcx_data.datasets(id), id text NOT NULL, batch_id uuid NOT NULL,
 started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL, channel text NOT NULL CHECK(channel IN ('voice','digital')),
 PRIMARY KEY(dataset_id,id), FOREIGN KEY(batch_id,dataset_id) REFERENCES rcx_data.batches(id,dataset_id), CHECK(ended_at>started_at), CHECK(ended_at-started_at<=interval '1 day')
);
CREATE TABLE IF NOT EXISTS rcx_data.handling_segments (
 dataset_id text NOT NULL, id text NOT NULL, interaction_id text NOT NULL, agent_id text NOT NULL,
 started_at timestamptz NOT NULL, ended_at timestamptz NOT NULL, PRIMARY KEY(dataset_id,id),
 FOREIGN KEY(dataset_id,interaction_id) REFERENCES rcx_data.interactions(dataset_id,id),
 FOREIGN KEY(dataset_id,agent_id) REFERENCES rcx_data.agents(dataset_id,id), CHECK(ended_at>started_at)
);
CREATE INDEX IF NOT EXISTS interactions_scope_time ON rcx_data.interactions(dataset_id,started_at,batch_id);
CREATE INDEX IF NOT EXISTS segments_agent_time ON rcx_data.handling_segments(dataset_id,agent_id,started_at);
CREATE INDEX IF NOT EXISTS segments_interaction ON rcx_data.handling_segments(dataset_id,interaction_id);
