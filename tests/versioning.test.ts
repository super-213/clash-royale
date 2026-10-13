import { describe, it, expect } from "vitest";
import {
  canonical,
  compareCards,
  deckIdentity,
  fieldsDiff,
} from "../shared/versioning";
import { cardSchema, deckSchema, type Card } from "../shared/schema";
const card: Card = {
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
  stats: {
    "characters/Knight": {
      hitpoints: 100,
      hit_speed: 1200,
      damage_per_level: [10, 11],
    },
  },
};
describe("version history semantics", () => {
  it("ignores object key ordering", () =>
    expect(canonical({ z: 1, a: { c: 2, b: 3 } })).toBe(
      canonical({ a: { b: 3, c: 2 }, z: 1 }),
    ));
  it("reports exact before/after, including arrays and zero baselines", () => {
    const changes = compareCards(
      [card],
      [
        {
          ...card,
          stats: {
            "characters/Knight": {
              hitpoints: 110,
              hit_speed: 1000,
              damage_per_level: [10, 12],
            },
          },
        },
      ],
    );
    expect(changes[0].fields).toContainEqual({
      path: "stats.characters/Knight.hitpoints",
      before: 100,
      after: 110,
      percent: 10,
    });
    expect(changes[0].fields).toContainEqual({
      path: "stats.characters/Knight.damage_per_level.1",
      before: 11,
      after: 12,
      percent: 100 / 11,
    });
    expect(fieldsDiff(0, 10)[0].percent).toBeNull();
  });
  it("does not call translation or image edits balance changes", () =>
    expect(
      compareCards(
        [card],
        [{ ...card, name: "新译名", description: "新说明", image_url: null }],
      ),
    ).toEqual([]));
  it("distinguishes additions/removals from numeric edits", () => {
    expect(compareCards([], [card])[0].kind).toBe("added");
    expect(compareCards([card], [])[0].kind).toBe("removed");
  });
  it("deduplicates card order but preserves variants", async () => {
    const slots = Array.from({ length: 8 }, (_, i) => ({
      id: 26000000 + i,
      variant: "normal" as const,
    }));
    expect(await deckIdentity("global", slots)).toBe(
      await deckIdentity("global", [...slots].reverse()),
    );
    expect(await deckIdentity("global", slots)).not.toBe(
      await deckIdentity("global", [
        { ...slots[0], variant: "evolution" },
        ...slots.slice(1),
      ]),
    );
  });
  it("rejects duplicate cards, unsafe images and wrong deck size", () => {
    expect(
      cardSchema.safeParse({
        ...card,
        image_url: "https://evil.example/card.svg",
      }).success,
    ).toBe(false);
    const d = {
      region: "global",
      slots: Array.from({ length: 8 }, () => ({
        id: 26000000,
        variant: "normal",
      })),
      source: "test",
      source_url: "https://example.com",
      title: "Test",
      kind: "preset",
      observed_at: "2026-01-01T00:00:00Z",
    };
    expect(deckSchema.safeParse(d).success).toBe(false);
  });
});
