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
const paths = await readdir("data/releases");
const releases = await Promise.all(
  paths
    .filter((p) => p.endsWith(".json"))
    .map((p) => readFile("data/releases/" + p, "utf8").then(JSON.parse)),
);
releases.sort((a, b) => a.source_updated_at.localeCompare(b.source_updated_at));
for (const release of releases)
  console.log(
    "Release",
    release.source_updated_at,
    await post("release", release),
  );
let additionalReleases = 0;
let additionalDecks = 0;
for (const file of ["community.json", "official.json", "feed.json"]) {
  const raw = await readFile("data/" + file, "utf8").catch(() => null);
  if (raw) {
    await post("release", JSON.parse(raw));
    additionalReleases++;
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
for (const p of runs.filter((p) => p.endsWith(".json")))
  await post("run", JSON.parse(await readFile("data/runs/" + p, "utf8")));
console.log(
  `Seeded ${releases.length + additionalReleases} snapshots and ${decks.length + additionalDecks} deck observations. Archive parameters are historical; community samples do not contain full combat stats.`,
);
