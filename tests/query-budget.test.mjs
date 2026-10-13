import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { deckWhere } from "../worker/deck-query.ts";

it("backfills existing decks, preserves filters, and starts selective queries at the index", () => {
  const filters = [
    { q: "", card: 26000000 },
    { q: "", kind: "community" },
    { q: "target", card: 26000000, kind: "community" },
    { q: "", ids: ["deck-0000", "deck-0000", "deck-0001"] },
    { q: "", ids: [] },
  ];
  const queries = filters.map((filter) => ({ filter, ...deckWhere(filter) }));
  const result = JSON.parse(execFileSync(process.env.PYTHON ?? "python3", ["tests/query-budget.py"], {
    input: JSON.stringify(queries), encoding: "utf8",
  }));
  expect(result.matches).toEqual([10, 10, 10, 2, 0]);
  expect(result.card_plan[0]).toContain("SEARCH membership USING PRIMARY KEY (card_id=?)");
  expect(result.card_plan[1]).toContain("SEARCH d USING INDEX sqlite_autoindex_decks_1 (id=?)");
  expect(result.kind_plan.join(" ")).toContain("deck_origin_kind");
  expect(result.old_vm_steps).toBeGreaterThan(result.new_vm_steps * 10);
});
