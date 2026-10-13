import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const temp = await mkdtemp(join(tmpdir(), "royale-integration-"));
const token = randomBytes(24).toString("hex"),
  port = 18800 + Math.floor(Math.random() * 500);
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const config = join(temp, "wrangler.json");
await writeFile(
  config,
  JSON.stringify({
    name: "royale-atlas-test",
    main: resolve("worker/index.ts"),
    compatibility_date: "2026-10-12",
    assets: {
      directory: resolve("dist"),
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*"],
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: "royale-atlas-test",
        database_id: "00000000-0000-0000-0000-000000000000",
        migrations_dir: resolve("migrations"),
      },
    ],
  }),
);
await writeFile(join(temp, ".dev.vars"), `INGEST_TOKEN=${token}\n`);
const env = {
  ...process.env,
  WRANGLER_SEND_METRICS: "false",
  XDG_CONFIG_HOME: join(temp, "config"),
};
const persist = join(temp, "state");
let server;
let output = "";
async function request(path, payload, auth = true) {
  const r = await fetch(
    `http://127.0.0.1:${port}${path}`,
    payload
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(auth ? { Authorization: "Bearer " + token } : {}),
          },
          body: JSON.stringify(payload),
        }
      : {},
  );
  return { status: r.status, data: await r.json(),
    cache: r.headers.get("X-Atlas-Cache"), cacheControl: r.headers.get("Cache-Control") };
}
async function warmStatus() {
  for (let i = 0; i < 30; i++) {
    const response = await request("/api/status");
    if (response.cache === "HIT") return response;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Status response was not cached");
}
try {
  execFileSync(
    process.execPath,
    [
      wrangler,
      "d1",
      "migrations",
      "apply",
      "royale-atlas-test",
      "--local",
      "--config",
      config,
      "--persist-to",
      persist,
    ],
    { env, stdio: "pipe" },
  );
  server = spawn(
    process.execPath,
    [
      wrangler,
      "dev",
      "--config",
      config,
      "--port",
      String(port),
      "--persist-to",
      persist,
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  server.stdout.on("data", (d) => (output += d));
  server.stderr.on("data", (d) => (output += d));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/api/health")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, "Worker did not start: " + output);
  assert.equal((await request("/api/balance-briefs")).status, 404, "Announcement briefs are retired");
  const builderFeed = await request("/api/deck-builder");
  assert.equal(builderFeed.status, 200);
  assert.equal(builderFeed.data.cards.length, 123);
  assert.equal(
    builderFeed.data.cards.find((card) => card.id === 27000000).name,
    "加农炮",
  );
  assert.ok(
    builderFeed.data.cards
      .find((card) => card.id === 26000023)
      .forms.includes("hero"),
  );
  const card = {
    id: 26000000,
    key: "knight",
    name: "骑士",
    name_en: "Knight",
    description: "",
    type: "Troop",
    rarity: "Common",
    elixir: 3,
    arena: 0,
    image_url: null,
    stats: {},
  };
  const baseline = {
    stream: "cr-data-community",
    revision: "a",
    source_url: "https://example.com/data",
    source_updated_at: "2026-01-01T00:00:00Z",
    observed_at: "2026-01-02T00:00:00Z",
    title: "Baseline",
    cards: [card],
  };
  assert.equal(
    (await request("/api/ingest/release", baseline, false)).status,
    401,
  );
  const first = await request("/api/ingest/release", baseline);
  assert.equal(first.status, 200);
  assert.equal(
    (await request("/api/ingest/release", baseline)).data.id,
    first.data.id,
  );
  const dictionary = await request(`/api/cards/dictionary?stream=cr-data-community&release=${first.data.id}`);
  assert.equal(dictionary.status, 200);
  assert.equal(dictionary.data.cards[0].name, card.name);
  assert.deepEqual(dictionary.data.cards[0].stats, {});
  assert.equal(
    (await request(`/api/cards/dictionary?stream=supercell-api&release=${first.data.id}`)).status, 404,
  );
  const second = await request("/api/ingest/release", {
    ...baseline,
    revision: "b",
    source_updated_at: "2026-02-01T00:00:00Z",
    cards: [{ ...card, name: "骑士新版目录" }],
  });
  assert.equal(second.status, 200);
  assert.equal(second.data.changes, 0, "Catalog refreshes do not record parameter changes");
  for (const path of [
    "/api/cards", "/api/cards/26000000", "/api/releases",
    `/api/compare?from=${first.data.id}&to=${second.data.id}`,
  ]) assert.equal((await request(path)).status, 404, `Retired endpoint: ${path}`);
  for (const stream of ["royaleapi-archive", "custom-stats-feed"]) {
    assert.equal((await request("/api/ingest/release", { ...baseline, stream })).status, 400);
  }
  assert.equal((await request("/api/ingest/release", {
    ...baseline, cards: [{ ...card, stats: { knight: { hitpoints: 100 } } }],
  })).status, 400, "Reject combat stats even on an active catalog stream");
  assert.equal(
    (await request("/api/ingest/release", { ...baseline, revision: "old" }))
      .status,
    409,
  );
  await request("/api/ingest/release", baseline);
  assert.equal(
    (await request("/api/status")).data.heads[0].id,
    second.data.id,
    "Replay must not roll the head back",
  );
  const cachedStatus = await warmStatus();
  assert.match(cachedStatus.cacheControl, /s-maxage=60/);
  const unchanged = await request("/api/ingest/release", {
    ...baseline,
    revision: "b-observed-again",
    source_updated_at: "2026-02-10T00:00:00Z",
    observed_at: "2026-02-11T00:00:00Z",
    cards: [{ ...card, name: "骑士新版目录" }],
  });
  assert.equal(unchanged.data.id, second.data.id);
  const observedHead = (await request("/api/status")).data.heads[0];
  assert.equal(observedHead.latest_source_updated_at, "2026-02-10T00:00:00Z");
  assert.equal(observedHead.source_updated_at, "2026-02-01T00:00:00Z");
  assert.equal((await warmStatus()).data.decks, 0);
  assert.equal(
    (
      await request("/api/ingest/release", {
        ...baseline,
        revision: "late-but-older-than-observation",
        source_updated_at: "2026-02-05T00:00:00Z",
        cards: [{ ...card, elixir: 6 }],
      })
    ).status,
    409,
  );
  const concurrent = await Promise.all(
    ["c", "d"].map((revision) =>
      request("/api/ingest/release", {
        ...baseline,
        revision,
        source_updated_at: "2026-03-01T00:00:00Z",
        cards: [{ ...card, elixir: revision === "c" ? 4 : 5 }],
      }),
    ),
  );
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  const slots = Array.from({ length: 8 }, (_, i) => ({
    id: 26000000 + i,
    variant: "normal",
  }));
  const d = {
    region: "global",
    slots,
    source: "test",
    source_url: "https://example.com/deck",
    title: "A test deck",
    kind: "preset",
    observed_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(
    (
      await request("/api/ingest/decks", {
        decks: [d, { ...d, slots: [...slots].reverse(), source: "second" }],
      })
    ).status,
    200,
  );
  let decks = (await request("/api/decks")).data;
  assert.equal(decks.total, 1);
  assert.equal((await request("/api/status")).data.decks, 1, "Ingestion invalidates status and updates the stored count");
  assert.equal(decks.items[0].origins.length, 2);
  assert.equal(
    (
      await request(
        "/api/decks?ids=" + decks.items[0].id + "," + decks.items[0].id,
      )
    ).data.total,
    1,
  );
  assert.equal(
    (
      await request("/api/ingest/decks", {
        decks: [{ ...d, slots: slots.slice(1) }],
      })
    ).status,
    400,
  );
  assert.equal((await request("/api/decks?card=26000000")).data.total, 1);
  assert.equal((await request("/api/decks?card=26000000&kind=preset&q=test")).data.total, 1);
  assert.equal((await request("/api/decks?kind=preset")).data.total, 1, "Two origins must not duplicate a deck");
  assert.equal((await request("/api/decks?card=29999999")).data.total, 0);
  assert.equal((await request("/api/decks?kind=community")).data.total, 0);
  assert.equal((await request("/api/decks?q=test")).data.total, 1);
  assert.equal((await request("/api/decks?page=-1")).status, 400);
  assert.equal((await request("/api/compare?from=no&to=no")).status, 404);
  assert.equal((await request("/api/does-not-exist")).status, 404);
  const shell = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(shell.status, 200);
  assert.match(await shell.text(), /皇室档案/);
  console.log(
    "Integration passed: real Worker + D1; auth, display catalogs, retired parameter endpoints/ingestion, idempotence, concurrency, origins, indexed filters, dictionary, status cache/invalidation, stored counts and assets.",
  );
} finally {
  if (server) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
  await rm(temp, { recursive: true, force: true });
}
