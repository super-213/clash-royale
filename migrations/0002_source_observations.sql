-- Freshness belongs to source observations, while commits stay immutable.
ALTER TABLE heads ADD COLUMN latest_source_updated_at TEXT;
ALTER TABLE heads ADD COLUMN last_observed_at TEXT;
UPDATE heads SET latest_source_updated_at=(SELECT source_updated_at FROM releases WHERE id=heads.release_id), last_observed_at=(SELECT observed_at FROM releases WHERE id=heads.release_id);
