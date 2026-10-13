import { Hono } from "hono";
import { z } from "zod";
import {
  releaseSchema,
  decksSchema,
  runSchema,
  type Release,
  type Deck,
} from "../shared/schema";
import { digest, compareCards } from "../shared/versioning";
import { readCards, publishRelease, publishDecks } from "./store";
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
    c.req.method === "GET" && !["/api/health", "/api/status"].includes(path);
  if (!cacheable) {
    await next();
    return;
  }
  const url = new URL(c.req.url);
  url.searchParams.sort();
  const key = new Request(url.toString());
  const immutable =
    path === "/api/compare" ||
    (path.startsWith("/api/cards") && url.searchParams.has("release"));
  const ttl = immutable ? 86400 : 60;
  const cache = await caches.open("royale-public-v1").catch(() => null);
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
      "SELECT r.*,h.latest_source_updated_at,h.last_observed_at FROM heads h JOIN releases r ON r.id=h.release_id ORDER BY r.stream",
    ).all<Release>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM decks WHERE hidden=0",
    ).first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT source,started_at,finished_at,status,count,message FROM crawl_runs WHERE id IN (SELECT id FROM (SELECT id,ROW_NUMBER() OVER (PARTITION BY source ORDER BY finished_at DESC) AS rank FROM crawl_runs) WHERE rank=1) ORDER BY source",
    ).all(),
  ]);
  return c.json({
    heads: heads.results,
    decks: decks?.count ?? 0,
    runs: runs.results,
  });
});
app.get("/api/releases", async (c) => {
  const stream = z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .parse(c.req.query("stream") ?? "royaleapi-archive");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(c.req.query("page") ?? 1);
  const r = await c.env.DB.prepare(
    "SELECT * FROM releases WHERE stream=? ORDER BY source_updated_at DESC LIMIT 30 OFFSET ?",
  )
    .bind(stream, (page - 1) * 30)
    .all<Release>();
  return c.json({ items: r.results, page });
});
app.get("/api/cards", async (c) => {
  const q = z
    .object({
      stream: z
        .string()
        .regex(/^[a-z0-9-]{1,60}$/)
        .default("royaleapi-archive"),
      release: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      q: z.string().max(100).default(""),
      type: z.string().max(50).default(""),
      rarity: z.string().max(50).default(""),
      elixir: z.coerce.number().int().min(0).max(20).optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1),
      limit: z.coerce.number().int().min(1).max(48).default(24),
    })
    .parse(c.req.query());
  const release = q.release
    ? await c.env.DB.prepare("SELECT * FROM releases WHERE id=? AND stream=?")
        .bind(q.release, q.stream)
        .first<Release>()
    : await c.env.DB.prepare(
        "SELECT r.* FROM heads h JOIN releases r ON r.id=h.release_id WHERE h.stream=?",
      )
        .bind(q.stream)
        .first<Release>();
  if (!release)
    return c.json({ items: [], total: 0, release: null, page: q.page });
  const clauses = ["release_id=?"];
  const values: (string | number)[] = [release.id];
  if (q.q) {
    clauses.push(
      "(instr(lower(name),lower(?))>0 OR instr(lower(name_en),lower(?))>0 OR instr(key,?)>0)",
    );
    values.push(q.q, q.q, q.q);
  }
  if (q.type) {
    clauses.push("type=?");
    values.push(q.type);
  }
  if (q.rarity) {
    clauses.push("rarity=?");
    values.push(q.rarity);
  }
  if (q.elixir !== undefined) {
    clauses.push("elixir=?");
    values.push(q.elixir);
  }
  const where = clauses.join(" AND ");
  const [rows, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT doc FROM card_versions WHERE ${where} ORDER BY elixir,card_id LIMIT ? OFFSET ?`,
    )
      .bind(...values, q.limit, (q.page - 1) * q.limit)
      .all<{ doc: string }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS count FROM card_versions WHERE ${where}`,
    )
      .bind(...values)
      .first<{ count: number }>(),
  ]);
  return c.json({
    items: rows.results.map((x) => JSON.parse(x.doc)),
    total: total?.count ?? 0,
    release,
    page: q.page,
  });
});
app.get("/api/cards/:id", async (c) => {
  const id = z.coerce.number().int().parse(c.req.param("id"));
  const stream = z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .parse(c.req.query("stream") ?? "royaleapi-archive");
  const release = c.req.query("release")
    ? z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(c.req.query("release"))
    : (
        await c.env.DB.prepare("SELECT release_id FROM heads WHERE stream=?")
          .bind(stream)
          .first<{ release_id: string }>()
      )?.release_id;
  if (!release) return c.json({ error: "No release" }, 404);
  const row = await c.env.DB.prepare(
    "SELECT cv.doc FROM card_versions cv JOIN releases r ON r.id=cv.release_id WHERE cv.release_id=? AND cv.card_id=? AND r.stream=?",
  )
    .bind(release, id, stream)
    .first<{ doc: string }>();
  if (!row) return c.json({ error: "Card not found" }, 404);
  const history = await c.env.DB.prepare(
    "SELECT r.id,r.title,r.source_updated_at,c.kind,json_array_length(c.fields) AS fields_count FROM changes c JOIN releases r ON r.id=c.release_id WHERE c.card_id=? AND r.stream=? ORDER BY r.source_updated_at DESC LIMIT 50",
  )
    .bind(id, stream)
    .all();
  return c.json({ card: JSON.parse(row.doc), history: history.results });
});
app.get("/api/compare", async (c) => {
  const from = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(c.req.query("from")),
    to = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(c.req.query("to"));
  const [a, b] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM releases WHERE id=?")
      .bind(from)
      .first<Release>(),
    c.env.DB.prepare("SELECT * FROM releases WHERE id=?")
      .bind(to)
      .first<Release>(),
  ]);
  if (!a || !b) return c.json({ error: "Version not found" }, 404);
  if (a.stream !== b.stream)
    return c.json({ error: "Compare versions in the same source stream" }, 400);
  const [ca, cb] = await Promise.all([
    readCards(c.env.DB, from),
    readCards(c.env.DB, to),
  ]);
  return c.json({ from: a, to: b, changes: compareCards(ca, cb) });
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
  const clauses = ["d.hidden=0"];
  const args: (string | number)[] = [];
  if (q.q) {
    clauses.push(
      "EXISTS (SELECT 1 FROM deck_origins o WHERE o.deck_id=d.id AND instr(lower(o.title),lower(?))>0)",
    );
    args.push(q.q);
  }
  if (q.kind) {
    clauses.push(
      "EXISTS (SELECT 1 FROM deck_origins o WHERE o.deck_id=d.id AND o.kind=?)",
    );
    args.push(q.kind);
  }
  if (q.card) {
    clauses.push(
      "EXISTS (SELECT 1 FROM json_each(d.slots) s WHERE json_extract(s.value,'$.id')=?)",
    );
    args.push(q.card);
  }
  if (q.ids !== undefined) {
    const ids = z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .max(60)
      .parse(q.ids ? q.ids.split(",") : []);
    if (!ids.length) return c.json({ items: [], total: 0, page: q.page });
    clauses.push(`d.id IN (${ids.map(() => "?").join(",")})`);
    args.push(...new Set(ids));
    /* placeholders must match deduped IDs */ clauses[clauses.length - 1] =
      `d.id IN (${[...new Set(ids)].map(() => "?").join(",")})`;
  }
  const where = clauses.join(" AND ");
  const [rows, count] = await Promise.all([
    c.env.DB.prepare(
      `SELECT d.* FROM decks d WHERE ${where} ORDER BY last_seen_at DESC,id LIMIT ? OFFSET ?`,
    )
      .bind(...args, q.limit, (q.page - 1) * q.limit)
      .all<{
        id: string;
        region: string;
        slots: string;
        created_at: string;
        last_seen_at: string;
      }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS count FROM decks d WHERE ${where}`)
      .bind(...args)
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
