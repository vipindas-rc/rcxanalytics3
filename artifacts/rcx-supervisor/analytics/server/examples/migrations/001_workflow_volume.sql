CREATE SCHEMA IF NOT EXISTS rcx_examples;

CREATE TABLE IF NOT EXISTS rcx_examples.datasets (
  id text PRIMARY KEY,
  domain text NOT NULL CHECK(domain IN ('workflow-volume')),
  seed bigint NOT NULL,
  generator_version text NOT NULL,
  definition_version text NOT NULL,
  assumptions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rcx_examples.coverage_batches (
  id uuid PRIMARY KEY,
  dataset_id text NOT NULL REFERENCES rcx_examples.datasets(id),
  domain text NOT NULL CHECK(domain IN ('workflow-volume')),
  owner_day date NOT NULL,
  sealed boolean NOT NULL DEFAULT false,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(dataset_id, domain, owner_day),
  UNIQUE(id, dataset_id)
);

CREATE TABLE IF NOT EXISTS rcx_examples.workflow_volumes (
  dataset_id text NOT NULL REFERENCES rcx_examples.datasets(id),
  id text NOT NULL,
  batch_id uuid NOT NULL,
  workflow_id text NOT NULL,
  workflow_name text NOT NULL,
  owner_day date NOT NULL,
  interaction_volume integer NOT NULL CHECK(interaction_volume > 0),
  PRIMARY KEY(dataset_id, id),
  FOREIGN KEY(batch_id, dataset_id) REFERENCES rcx_examples.coverage_batches(id, dataset_id),
  UNIQUE(dataset_id, owner_day, workflow_id)
);

CREATE TABLE IF NOT EXISTS rcx_examples.revisions (
  id uuid PRIMARY KEY,
  dataset_id text NOT NULL REFERENCES rcx_examples.datasets(id),
  ordinal bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  sealed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rcx_examples.revision_batches (
  revision_id uuid NOT NULL REFERENCES rcx_examples.revisions(id),
  batch_id uuid NOT NULL REFERENCES rcx_examples.coverage_batches(id),
  PRIMARY KEY(revision_id, batch_id)
);

CREATE INDEX IF NOT EXISTS workflow_volumes_scope ON rcx_examples.workflow_volumes(dataset_id, owner_day, workflow_id);

CREATE FUNCTION rcx_examples.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Synthetic example records are immutable; publish a new dataset revision'; END $$;

CREATE FUNCTION rcx_examples.seal_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NOT OLD.sealed AND NEW.sealed AND (to_jsonb(OLD)-'sealed')=(to_jsonb(NEW)-'sealed') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Published synthetic coverage and revisions are immutable';
END $$;

CREATE FUNCTION rcx_examples.check_open_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE is_sealed boolean;
BEGIN
  SELECT sealed INTO is_sealed FROM rcx_examples.coverage_batches WHERE id=NEW.batch_id;
  IF is_sealed THEN RAISE EXCEPTION 'Cannot append rows to published synthetic coverage'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION rcx_examples.check_open_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM rcx_examples.revisions WHERE id=NEW.revision_id AND sealed) THEN RAISE EXCEPTION 'Cannot change a published synthetic revision manifest'; END IF;
  IF NOT EXISTS(SELECT 1 FROM rcx_examples.revisions r JOIN rcx_examples.coverage_batches b ON b.dataset_id=r.dataset_id WHERE r.id=NEW.revision_id AND b.id=NEW.batch_id AND b.sealed) THEN
    RAISE EXCEPTION 'Revision batches must belong to the same dataset and be complete';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER immutable_example_datasets BEFORE UPDATE OR DELETE ON rcx_examples.datasets FOR EACH ROW EXECUTE FUNCTION rcx_examples.reject_mutation();
CREATE TRIGGER immutable_workflow_volumes BEFORE UPDATE OR DELETE ON rcx_examples.workflow_volumes FOR EACH ROW EXECUTE FUNCTION rcx_examples.reject_mutation();
CREATE TRIGGER immutable_example_manifest BEFORE UPDATE OR DELETE ON rcx_examples.revision_batches FOR EACH ROW EXECUTE FUNCTION rcx_examples.reject_mutation();
CREATE TRIGGER seal_example_batches BEFORE UPDATE OR DELETE ON rcx_examples.coverage_batches FOR EACH ROW EXECUTE FUNCTION rcx_examples.seal_only();
CREATE TRIGGER seal_example_revisions BEFORE UPDATE OR DELETE ON rcx_examples.revisions FOR EACH ROW EXECUTE FUNCTION rcx_examples.seal_only();
CREATE TRIGGER insert_workflow_volumes BEFORE INSERT ON rcx_examples.workflow_volumes FOR EACH ROW EXECUTE FUNCTION rcx_examples.check_open_batch();
CREATE TRIGGER insert_example_manifest BEFORE INSERT ON rcx_examples.revision_batches FOR EACH ROW EXECUTE FUNCTION rcx_examples.check_open_revision();
