import { readFile, writeFile } from "node:fs/promises";
const id = process.env.CLOUDFLARE_D1_ID;
if (
  !id ||
  !/^[a-f0-9-]{36}$/.test(id) ||
  id === "00000000-0000-0000-0000-000000000000"
)
  throw new Error("Configure production variable CLOUDFLARE_D1_ID");
const path = "wrangler.jsonc";
const config = JSON.parse(await readFile(path, "utf8"));
config.d1_databases[0].database_id = id;
await writeFile(path, JSON.stringify(config, null, 2) + "\n");
