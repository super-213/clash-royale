import { readFile, readdir } from "node:fs/promises";
const base = process.env.ARENA_API_URL ?? "http://127.0.0.1:8787";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error(
    "Seed is local-only; use the crawler for production ingestion",
  );
let token = process.env.INGEST_TOKEN;
if (!token) {
  const vars = await readFile(".dev.vars", "utf8").catch(() => "");
  token = vars.match(/^INGEST_TOKEN=["']?([^"'\r\n]+)/m)?.[1];
}
if (!token)
  throw new Error("Set INGEST_TOKEN in .dev.vars and start npm run preview");
async function post(path, payload) {
  const r = await fetch(base + "/api/ingest/" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
let catalogs = 0;
let additionalDecks = 0;
for (const file of ["community.json", "official.json"]) {
  const raw = await readFile("data/" + file, "utf8").catch(() => null);
  if (raw) {
    const catalog = JSON.parse(raw);
    if (catalog.cards.some((card) => Object.keys(card.stats ?? {}).length))
      throw new Error("Seed only accepts card identity/display catalogs");
    await post("release", catalog);
    catalogs++;
  }
}
for (const file of ["community-decks.json", "player-decks.json"]) {
  const raw = await readFile("data/" + file, "utf8").catch(() => null);
  if (raw) {
    const { decks } = JSON.parse(raw);
    additionalDecks += decks.length;
    for (let i = 0; i < decks.length; i += 25)
      await post("decks", { decks: decks.slice(i, i + 25) });
  }
}
const { decks } = JSON.parse(await readFile("data/decks.json", "utf8"));
for (let i = 0; i < decks.length; i += 25)
  await post("decks", { decks: decks.slice(i, i + 25) });
const runs = await readdir("data/runs").catch(() => []);
for (const p of runs.filter((p) => p.endsWith(".json"))) {
  const run = JSON.parse(await readFile("data/runs/" + p, "utf8"));
  if (["community", "official"].includes(run.source)) await post("run", run);
}
console.log(
  `Seeded ${catalogs} display catalogs and ${decks.length + additionalDecks} deck observations. Combat parameters and history ingestion are disabled.`,
);
