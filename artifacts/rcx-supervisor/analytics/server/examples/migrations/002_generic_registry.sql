ALTER TABLE rcx_examples.datasets DROP CONSTRAINT IF EXISTS datasets_domain_check;
ALTER TABLE rcx_examples.coverage_batches DROP CONSTRAINT IF EXISTS coverage_batches_domain_check;

CREATE TABLE IF NOT EXISTS rcx_examples.definitions (
  id text NOT NULL,
  version text NOT NULL,
  domain text NOT NULL,
  title text NOT NULL,
  fields jsonb NOT NULL,
  formulas jsonb NOT NULL,
  assumptions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(id, version)
);

CREATE TABLE IF NOT EXISTS rcx_examples.recipes (
  id text NOT NULL,
  version text NOT NULL,
  definition_id text NOT NULL,
  definition_version text NOT NULL,
  generator_version text NOT NULL,
  configuration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(id, version),
  FOREIGN KEY(definition_id, definition_version) REFERENCES rcx_examples.definitions(id, version)
);

CREATE TABLE IF NOT EXISTS rcx_examples.entities (
  dataset_id text NOT NULL REFERENCES rcx_examples.datasets(id),
  id text NOT NULL,
  entity_type text NOT NULL,
  display_name text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(dataset_id, id)
);

CREATE TABLE IF NOT EXISTS rcx_examples.generic_records (
  dataset_id text NOT NULL REFERENCES rcx_examples.datasets(id),
  id text NOT NULL,
  batch_id uuid NOT NULL,
  domain text NOT NULL,
  owner_day date NOT NULL,
  entity_id text,
  dimensions jsonb NOT NULL,
  measures jsonb NOT NULL,
  PRIMARY KEY(dataset_id, id),
  FOREIGN KEY(batch_id, dataset_id) REFERENCES rcx_examples.coverage_batches(id, dataset_id),
  FOREIGN KEY(dataset_id, entity_id) REFERENCES rcx_examples.entities(dataset_id, id)
);

CREATE INDEX IF NOT EXISTS generic_records_scope ON rcx_examples.generic_records(dataset_id, domain, owner_day);

CREATE TRIGGER immutable_example_definitions BEFORE UPDATE OR DELETE ON rcx_examples.definitions FOR EACH ROW EXECUTE FUNCTION rcx_examples.reject_mutation();
CREATE TRIGGER immutable_example_recipes BEFORE UPDATE OR DELETE ON rcx_examples.recipes FOR EACH ROW EXECUTE FUNCTION rcx_examples.reject_mutation();
CREATE TRIGGER immutable_example_entities BEFORE UPDATE OR DELETE ON rcx_examples.entities FOR EACH ROW EXECUTE FUNCTION rcx_examples.reject_mutation();
CREATE TRIGGER immutable_example_generic_records BEFORE UPDATE OR DELETE ON rcx_examples.generic_records FOR EACH ROW EXECUTE FUNCTION rcx_examples.reject_mutation();
CREATE TRIGGER insert_generic_records BEFORE INSERT ON rcx_examples.generic_records FOR EACH ROW EXECUTE FUNCTION rcx_examples.check_open_batch();
