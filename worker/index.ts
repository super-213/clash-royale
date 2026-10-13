import { Hono } from "hono";
import { z } from "zod";
import {
  releaseSchema,
  decksSchema,
  runSchema,
  type Release,
  type Deck,
  type Card,
} from "../shared/schema";
import { digest } from "../shared/versioning";
import { publishRelease, publishDecks } from "./store";
import { builderCards } from "./builder-feed";
import { deckWhere } from "./deck-query";
const PUBLIC_CACHE = "royale-public-v4";
type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  INGEST_TOKEN?: string;
  ENVIRONMENT: string;
};
const app = new Hono<{ Bindings: Env }>();
app.use("/api/*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Cache-Control", "no-store");
  await next();
});
// Immutable version reads can be cached globally without invalidation. Head/list reads
// have a short TTL; publication remains independent of browsing.
app.use("/api/*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const cacheable =
    c.req.method === "GET" && path !== "/api/health";
  if (!cacheable) {
    await next();
    return;
  }
  const url = new URL(c.req.url);
  if (path === "/api/status") url.search = "";
  url.searchParams.sort();
  const key = new Request(url.toString());
  const immutable =
    path === "/api/cards/dictionary" && url.searchParams.has("release");
  const ttl = immutable ? 86400 : 60;
  const cache = await caches.open(PUBLIC_CACHE).catch(() => null);
  try {
    const hit = await cache?.match(key);
    if (hit) {
      c.res = new Response(hit.body, hit);
      c.header("X-Atlas-Cache", "HIT");
      return;
    }
  } catch {
    /* Local cache or cache service unavailable: read D1. */
  }
  await next();
  if (c.res.status === 200) {
    c.header(
      "Cache-Control",
      immutable
        ? `public, max-age=${ttl}`
        : `public, max-age=0, s-maxage=${ttl}`,
    );
    c.header("X-Atlas-Cache", "MISS");
    const response = c.res.clone();
    c.executionCtx.waitUntil(
      cache ? cache.put(key, response).catch(() => {}) : Promise.resolve(),
    );
  }
});
app.use("/api/ingest/*", async (c, next) => {
  if (!c.env.INGEST_TOKEN)
    return c.json({ error: "Ingestion is not configured" }, 503);
  if (
    (await digest(c.req.header("Authorization") ?? "")) !==
    (await digest(`Bearer ${c.env.INGEST_TOKEN}`))
  )
    return c.json({ error: "Unauthorized" }, 401);
  await next();
  // Refresh this data center immediately after a successful ingestion.
  // Other data centers may serve their previous status for at most 60 seconds.
  if (c.res.status >= 200 && c.res.status < 300) {
    try {
      const cache = await caches.open(PUBLIC_CACHE);
      await cache.delete(new Request(new URL("/api/status", c.req.url).toString()));
    } catch { /* Cache failure must not roll back a successful ingestion. */ }
  }
});
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID: Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 6_000_000) {
      await reader.cancel();
      throw new Error("LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("INVALID: Invalid JSON");
  }
}
app.onError((err, c) => {
  if (err instanceof z.ZodError)
    return c.json(
      {
        error: "Invalid request",
        details: err.issues.map((x) => ({ path: x.path, message: x.message })),
      },
      400,
    );
  if (err.message === "LARGE")
    return c.json({ error: "Body exceeds 6 MB" }, 413);
  if (err.message.startsWith("INVALID:"))
    return c.json({ error: err.message }, 422);
  if (
    err.message.startsWith("CONFLICT:") ||
    err.message.includes("UNIQUE constraint")
  )
    return c.json(
      { error: "Version conflict; refresh the head before retrying" },
      409,
    );
  console.error(err);
  return c.json({ error: "Request failed" }, 500);
});
app.get("/api/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ ok: true, version: "0.1.0" });
});
app.post("/api/ingest/release", async (c) =>
  c.json(
    await publishRelease(c.env.DB, releaseSchema.parse(await body(c.req.raw))),
  ),
);
app.post("/api/ingest/decks", async (c) =>
  c.json(
    await publishDecks(
      c.env.DB,
      decksSchema.parse(await body(c.req.raw)).decks,
    ),
  ),
);
app.post("/api/ingest/run", async (c) => {
  const r = runSchema.parse(await body(c.req.raw));
  await c.env.DB.prepare(
    "INSERT INTO crawl_runs VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
  )
    .bind(
      r.id,
      r.source,
      r.started_at,
      r.finished_at,
      r.status,
      r.count,
      r.message,
    )
    .run();
  return c.json({ ok: true });
});
app.get("/api/status", async (c) => {
  const [heads, decks, runs] = await Promise.all([
    c.env.DB.prepare(
      "SELECT r.*,h.latest_source_updated_at,h.last_observed_at FROM heads h JOIN releases r ON r.id=h.release_id WHERE r.stream IN ('cr-data-community','supercell-api') ORDER BY r.stream",
    ).all<Release>(),
    c.env.DB.prepare(
      "SELECT count FROM catalog_totals WHERE name='visible_decks'",
    ).first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT source,started_at,finished_at,status,count,message FROM crawl_runs WHERE source IN ('community','official') AND id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER (PARTITION BY source ORDER BY finished_at DESC) AS rank FROM crawl_runs) WHERE rank=1) ORDER BY source",
    ).all(),
  ]);
  return c.json({
    heads: heads.results,
    decks: decks?.count ?? 0,
    runs: runs.results,
  });
});
app.get("/api/deck-builder", (c) => c.json({ cards: builderCards }));
app.get("/api/cards/dictionary", async (c) => {
  const q = z.object({
    stream: z.enum(["cr-data-community", "supercell-api"]),
    release: z.string().regex(/^[a-f0-9]{64}$/),
  }).parse(c.req.query());
  const release = await c.env.DB.prepare("SELECT id FROM releases WHERE id=? AND stream=?")
    .bind(q.release, q.stream).first();
  if (!release) return c.json({ error: "Version not found" }, 404);
  // The UI dictionary needs identity/display metadata, not megabytes of stats.
  const rows = await c.env.DB.prepare(
    "SELECT json_set(doc,'$.stats',json('{}')) AS doc FROM card_versions WHERE release_id=? ORDER BY card_id",
  ).bind(q.release).all<{ doc: string }>();
  return c.json({ cards: rows.results.map((row) => JSON.parse(row.doc) as Card) });
});
app.get("/api/decks", async (c) => {
  const q = z
    .object({
      q: z.string().max(100).default(""),
      card: z.coerce.number().int().optional(),
      kind: z.enum(["preset", "player", "community"]).optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
      limit: z.coerce.number().int().min(1).max(48).default(12),
      ids: z.string().max(4200).optional(),
    })
    .parse(c.req.query());
  let idsFilter: string[] | undefined;
  if (q.ids !== undefined) {
    idsFilter = z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .max(60)
      .parse(q.ids ? q.ids.split(",") : []);
    if (!idsFilter.length) return c.json({ items: [], total: 0, page: q.page });
  }
  const { from, where, args, unfiltered } = deckWhere({ ...q, ids: idsFilter });
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT d.* FROM ${from} WHERE ${where} ORDER BY d.last_seen_at DESC,d.id LIMIT ? OFFSET ?`,
    )
      .bind(...args, q.limit, (q.page - 1) * q.limit)
      .all<{
        id: string;
        region: string;
        slots: string;
        created_at: string;
        last_seen_at: string;
      }>(),
    c.env.DB.prepare(unfiltered
      ? "SELECT count FROM catalog_totals WHERE name='visible_decks'"
      : `SELECT COUNT(*) AS count FROM ${from} WHERE ${where}`)
      .bind(...(unfiltered ? [] : args))
      .first<{ count: number }>(),
  ]);
  const ids = rows.results.map((x) => x.id);
  const origins = ids.length
    ? (
        await c.env.DB.prepare(
          `SELECT * FROM deck_origins WHERE deck_id IN (${ids.map(() => "?").join(",")}) ORDER BY observed_at DESC`,
        )
          .bind(...ids)
          .all<{
            deck_id: string;
            source: string;
            source_url: string;
            title: string;
            kind: string;
            observed_at: string;
          }>()
      ).results
    : [];
  const items: Deck[] = rows.results.map((x) => ({
    ...x,
    slots: JSON.parse(x.slots),
    origins: origins.filter((o) => o.deck_id === x.id),
  }));
  return c.json({ items, total: count?.count ?? 0, page: q.page });
});
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
export default app;
