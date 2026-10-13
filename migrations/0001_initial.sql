PRAGMA foreign_keys = ON;
CREATE TABLE releases (
 id TEXT PRIMARY KEY, stream TEXT NOT NULL, parent_id TEXT REFERENCES releases(id),
 content_hash TEXT NOT NULL, revision TEXT NOT NULL, source_url TEXT NOT NULL,
 source_updated_at TEXT NOT NULL, observed_at TEXT NOT NULL, card_count INTEGER NOT NULL,
 change_count INTEGER NOT NULL, title TEXT NOT NULL
);
-- A stream is a linear history. Two concurrent children cannot both publish.
CREATE UNIQUE INDEX release_parent ON releases(stream, COALESCE(parent_id, 'ROOT'));
CREATE INDEX release_stream_date ON releases(stream, source_updated_at DESC);
CREATE TABLE heads (stream TEXT PRIMARY KEY, release_id TEXT NOT NULL REFERENCES releases(id));
CREATE TABLE card_versions (
 release_id TEXT NOT NULL REFERENCES releases(id), card_id INTEGER NOT NULL,
 key TEXT NOT NULL, name TEXT NOT NULL, name_en TEXT NOT NULL, type TEXT NOT NULL,
 rarity TEXT NOT NULL, elixir INTEGER NOT NULL, arena INTEGER, doc TEXT NOT NULL,
 PRIMARY KEY(release_id, card_id), UNIQUE(release_id, key)
);
CREATE INDEX card_filter ON card_versions(release_id, type, rarity, elixir);
CREATE TABLE changes (
 release_id TEXT NOT NULL REFERENCES releases(id), card_id INTEGER NOT NULL,
 kind TEXT NOT NULL, fields TEXT NOT NULL, PRIMARY KEY(release_id,card_id)
);
CREATE INDEX card_history ON changes(card_id, release_id);
CREATE TABLE decks (
 id TEXT PRIMARY KEY, region TEXT NOT NULL, slots TEXT NOT NULL,
 created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE deck_origins (
 deck_id TEXT NOT NULL REFERENCES decks(id), source TEXT NOT NULL, source_url TEXT NOT NULL,
 title TEXT NOT NULL, kind TEXT NOT NULL, observed_at TEXT NOT NULL,
 PRIMARY KEY(deck_id, source, source_url)
);
CREATE INDEX deck_seen ON decks(hidden, last_seen_at DESC, id);
CREATE TABLE crawl_runs (
 id TEXT PRIMARY KEY, source TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
 status TEXT NOT NULL, count INTEGER NOT NULL, message TEXT NOT NULL
);
CREATE INDEX run_source_date ON crawl_runs(source, finished_at DESC);
