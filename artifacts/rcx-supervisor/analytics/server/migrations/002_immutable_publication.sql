ALTER TABLE rcx_data.batches ADD COLUMN sealed boolean NOT NULL DEFAULT false;
ALTER TABLE rcx_data.revisions ADD COLUMN sealed boolean NOT NULL DEFAULT false;
UPDATE rcx_data.batches SET sealed=true;
UPDATE rcx_data.revisions SET sealed=true;

CREATE FUNCTION rcx_data.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Operational records are immutable; publish a new dataset revision'; END $$;
CREATE FUNCTION rcx_data.seal_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND NOT OLD.sealed AND NEW.sealed AND (to_jsonb(OLD)-'sealed')=(to_jsonb(NEW)-'sealed') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Published coverage and revisions are immutable';
END $$;
CREATE FUNCTION rcx_data.check_open_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE is_sealed boolean;
BEGIN
 IF TG_TABLE_NAME='interactions' THEN SELECT sealed INTO is_sealed FROM rcx_data.batches WHERE id=NEW.batch_id;
 ELSE SELECT b.sealed INTO is_sealed FROM rcx_data.interactions i JOIN rcx_data.batches b ON b.id=i.batch_id WHERE i.dataset_id=NEW.dataset_id AND i.id=NEW.interaction_id;
 END IF;
 IF is_sealed THEN RAISE EXCEPTION 'Cannot append events to published coverage'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION rcx_data.check_open_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM rcx_data.revisions WHERE id=NEW.revision_id AND sealed) THEN RAISE EXCEPTION 'Cannot change a published revision manifest'; END IF;
 IF NOT EXISTS(SELECT 1 FROM rcx_data.revisions r JOIN rcx_data.batches b ON b.dataset_id=r.dataset_id WHERE r.id=NEW.revision_id AND b.id=NEW.batch_id AND b.sealed) THEN RAISE EXCEPTION 'Revision batches must belong to the same dataset and be complete'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_datasets BEFORE UPDATE OR DELETE ON rcx_data.datasets FOR EACH ROW EXECUTE FUNCTION rcx_data.reject_mutation();
CREATE TRIGGER immutable_agents BEFORE UPDATE OR DELETE ON rcx_data.agents FOR EACH ROW EXECUTE FUNCTION rcx_data.reject_mutation();
CREATE TRIGGER immutable_interactions BEFORE UPDATE OR DELETE ON rcx_data.interactions FOR EACH ROW EXECUTE FUNCTION rcx_data.reject_mutation();
CREATE TRIGGER immutable_segments BEFORE UPDATE OR DELETE ON rcx_data.handling_segments FOR EACH ROW EXECUTE FUNCTION rcx_data.reject_mutation();
CREATE TRIGGER immutable_manifest BEFORE UPDATE OR DELETE ON rcx_data.revision_batches FOR EACH ROW EXECUTE FUNCTION rcx_data.reject_mutation();
CREATE TRIGGER seal_batches BEFORE UPDATE OR DELETE ON rcx_data.batches FOR EACH ROW EXECUTE FUNCTION rcx_data.seal_only();
CREATE TRIGGER seal_revisions BEFORE UPDATE OR DELETE ON rcx_data.revisions FOR EACH ROW EXECUTE FUNCTION rcx_data.seal_only();
CREATE TRIGGER insert_interactions BEFORE INSERT ON rcx_data.interactions FOR EACH ROW EXECUTE FUNCTION rcx_data.check_open_batch();
CREATE TRIGGER insert_segments BEFORE INSERT ON rcx_data.handling_segments FOR EACH ROW EXECUTE FUNCTION rcx_data.check_open_batch();
CREATE TRIGGER insert_manifest BEFORE INSERT ON rcx_data.revision_batches FOR EACH ROW EXECUTE FUNCTION rcx_data.check_open_revision();
