import type { DeckInput, Release, ReleaseInput } from "../shared/schema";
import {
  canonical,
  digest,
  deckIdentity,
} from "../shared/versioning";
export async function publishRelease(db: D1Database, input: ReleaseInput) {
  const cards = [...input.cards].sort((a, b) => a.id - b.id);
  const hash = await digest(canonical(cards));
  const id = await digest(`${input.stream}:${input.revision}:${hash}`);
  const existing = await db
    .prepare("SELECT id FROM releases WHERE id=?")
    .bind(id)
    .first();
  if (existing) {
    await db
      .prepare(
        "UPDATE heads SET latest_source_updated_at=MAX(COALESCE(latest_source_updated_at,?),?),last_observed_at=MAX(COALESCE(last_observed_at,?),?) WHERE stream=? AND release_id=?",
      )
      .bind(
        input.source_updated_at,
        input.source_updated_at,
        input.observed_at,
        input.observed_at,
        input.stream,
        id,
      )
      .run();
    return { id, unchanged: true };
  }
  const head = await db
    .prepare(
      "SELECT r.*,h.latest_source_updated_at,h.last_observed_at FROM heads h JOIN releases r ON r.id=h.release_id WHERE h.stream=?",
    )
    .bind(input.stream)
    .first<Release>();
  if (head && head.content_hash === hash) {
    await db
      .prepare(
        "UPDATE heads SET latest_source_updated_at=MAX(COALESCE(latest_source_updated_at,?),?),last_observed_at=MAX(COALESCE(last_observed_at,?),?) WHERE stream=? AND release_id=?",
      )
      .bind(
        input.source_updated_at,
        input.source_updated_at,
        input.observed_at,
        input.observed_at,
        input.stream,
        head.id,
      )
      .run();
    return { id: head.id, unchanged: true };
  }
  if (
    head &&
    input.source_updated_at <=
      (head.latest_source_updated_at ?? head.source_updated_at)
  )
    throw new Error(
      "CONFLICT: Source revision is older than or equal to the current head",
    );
  if (head && cards.length < head.card_count * 0.9)
    throw new Error(
      "INVALID: More than 10% of cards disappeared; review source coverage",
    );
  const statements = [
    db
      .prepare(
        "INSERT INTO releases (id,stream,parent_id,content_hash,revision,source_url,source_updated_at,observed_at,card_count,change_count,title) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        input.stream,
        head?.id ?? null,
        hash,
        input.revision,
        input.source_url,
        input.source_updated_at,
        input.observed_at,
        cards.length,
        0,
        input.title,
      ),
  ];
  for (const c of cards)
    statements.push(
      db
        .prepare(
          "INSERT INTO card_versions (release_id,card_id,key,name,name_en,type,rarity,elixir,arena,doc) VALUES (?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          c.id,
          c.key,
          c.name,
          c.name_en,
          c.type,
          c.rarity,
          c.elixir,
          c.arena,
          canonical(c),
        ),
    );
  statements.push(
    db
      .prepare(
        "INSERT INTO heads(stream,release_id,latest_source_updated_at,last_observed_at) VALUES (?,?,?,?) ON CONFLICT(stream) DO UPDATE SET release_id=excluded.release_id,latest_source_updated_at=excluded.latest_source_updated_at,last_observed_at=excluded.last_observed_at",
      )
      .bind(input.stream, id, input.source_updated_at, input.observed_at),
  );
  // D1 batch is transactional. Unique parent index rejects concurrent siblings, rolling everything back.
  await db.batch(statements);
  return { id, unchanged: false, changes: 0 };
}
export async function publishDecks(db: D1Database, decks: DeckInput[]) {
  const statements = [];
  for (const d of decks) {
    const id = await deckIdentity(d.region, d.slots);
    statements.push(
      db
        .prepare(
          "INSERT INTO decks(id,region,slots,created_at,last_seen_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen_at=MAX(decks.last_seen_at,excluded.last_seen_at)",
        )
        .bind(id, d.region, canonical(d.slots), d.observed_at, d.observed_at),
    );
    statements.push(
      db
        .prepare(
          "INSERT INTO deck_origins(deck_id,source,source_url,title,kind,observed_at) VALUES (?,?,?,?,?,?) ON CONFLICT(deck_id,source,source_url) DO UPDATE SET title=excluded.title,observed_at=MAX(deck_origins.observed_at,excluded.observed_at)",
        )
        .bind(id, d.source, d.source_url, d.title, d.kind, d.observed_at),
    );
  }
  await db.batch(statements);
  return { accepted: decks.length };
}
