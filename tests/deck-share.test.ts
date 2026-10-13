import { describe, expect, it } from "vitest";
import { fullDeckUrl, readSharedDeck } from "../shared/deck-share";
import { createPersonalDeck, validateDraft } from "../shared/personal-decks";
import { towerTroops } from "../shared/tower-troops";
import { builderCards } from "../worker/builder-feed";

const cards = Object.fromEntries(builderCards.map((card) => [card.id, card]));
const slots = [
  { id: 26000030, variant: "evolution" as const },
  { id: 26000038, variant: "hero" as const },
  { id: 26000000, variant: "hero" as const },
  ...[26000010, 27000006, 26000001, 28000011, 28000000].map((id) => ({ id, variant: "normal" as const })),
];
function encoded(value: unknown) {
  return "#deck=" + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("complete deck sharing", () => {
  it("restores exact order, all forms, Unicode names and every tower without local identity", () => {
    for (const tower of towerTroops) {
      for (const variant of ["normal", "evolution", "hero"] as const) {
        const composition = slots.map((slot, i) => i === 2 ? { ...slot, variant } : slot);
        const original = createPersonalDeck("我的卡组 🏰 & #?/", composition, cards, undefined, tower.key);
        const url = new URL(fullDeckUrl(original, "https://example.com/atlas/?q=secret#old"));
        expect(url.pathname).toBe("/atlas/");
        expect(url.search).toBe("?view=brief");
        const shared = readSharedDeck(url.hash)!;
        expect(shared).toEqual({ version: 1, name: original.name, slots: original.slots, tower_troop: tower.key });
        expect(validateDraft(shared.slots, cards)).toBeNull();
        const imported = createPersonalDeck(shared.name, shared.slots, cards, undefined, shared.tower_troop);
        expect(imported.id).not.toBe(original.id);
        expect(imported.slots).toEqual(original.slots);
        expect(imported.tower_troop).toBe(original.tower_troop);
      }
    }
  });
  it("ignores unrelated fragments and rejects corrupt, oversized or incompatible payloads", () => {
    expect(readSharedDeck("")).toBeNull();
    expect(readSharedDeck("#section")).toBeNull();
    const valid = readSharedDeck(new URL(fullDeckUrl({ name: "卡组", slots, tower_troop: "royal-chef" }, "https://example.com")).hash)!;
    for (const hash of [
      "#deck=", "#deck=%", "#deck=" + "a".repeat(2049), encoded({}),
      encoded({ ...valid, version: 2 }),
      encoded({ ...valid, tower_troop: "knight" }),
      encoded({ ...valid, slots: slots.slice(1) }),
      encoded({ ...valid, slots: [...slots.slice(0, 7), slots[0]] }),
      encoded({ ...valid, slots: slots.map((slot, i) => i === 0 ? { ...slot, variant: "unknown" } : slot) }),
      encoded({ ...valid, cards: [{ image_url: "https://untrusted.example" }] }),
    ]) expect(() => readSharedDeck(hash)).toThrow(/分享链接无效/);
  });
  it("blocks unsupported cards/forms before saving instead of normalizing the shared composition", () => {
    const unsupported = { name: "待核对卡组", slots: slots.map((slot, i) => i === 5 ? { ...slot, variant: "hero" as const } : slot), tower_troop: "tower-princess" as const };
    const restored = readSharedDeck(new URL(fullDeckUrl(unsupported, "https://example.com")).hash)!;
    expect(restored.slots).toEqual(unsupported.slots);
    expect(validateDraft(restored.slots, cards)).toMatch(/不支持/);
    expect(() => createPersonalDeck(restored.name, restored.slots, cards, undefined, restored.tower_troop)).toThrow();
  });
});
