import { describe, expect, it } from "vitest";
import { layoutDeck, type DeckCard } from "../shared/deck-layout";
import type { Slot } from "../shared/schema";
import { copyDeckUrl, deckIdentity } from "../shared/versioning";

const base: Slot[] = Array.from({ length: 8 }, (_, i) => ({
  id: 26000000 + i,
  variant: "normal",
}));
const forms = (values: Record<number, Slot["variant"]>) =>
  base.map((slot, i) => ({
    ...slot,
    variant: values[i] ?? slot.variant,
  }));

describe("current deck slot layout", () => {
  it("places two evolutions and a hero into the first three compatible slots", () => {
    const source = forms({ 3: "evolution", 5: "hero", 7: "evolution" });
    const result = layoutDeck(source, {});
    expect(
      result.cells
        .slice(0, 3)
        .map((cell) => [cell.kind, cell.slot.id, cell.active]),
    ).toEqual([
      ["evolution", base[3].id, true],
      ["hero", base[5].id, true],
      ["wild", base[7].id, true],
    ]);
    expect(
      result.cells
        .slice(3)
        .every((cell) => cell.kind === "regular" && !cell.active),
    ).toBe(true);
    expect(result.conflicts).toHaveLength(0);
  });
  it("also supports one evolution and two heroes with a hero in the mixed slot", () => {
    const result = layoutDeck(
      forms({ 2: "hero", 4: "hero", 6: "evolution" }),
      {},
    );
    expect(result.slots.slice(0, 3).map((slot) => slot.id)).toEqual([
      base[6].id,
      base[2].id,
      base[4].id,
    ]);
    expect(result.conflicts).toHaveLength(0);
  });
  it("recognizes a Champion as eligible without changing its normal variant", () => {
    const champion: DeckCard = {
      name: "英雄牌",
      image_url: null,
      rarity: "Champion",
    };
    const result = layoutDeck(base, { [base[6].id]: champion });
    expect(result.cells[1]).toMatchObject({
      slot: base[6],
      active: true,
      formLabel: "英雄牌",
    });
    expect(result.cells[1].slot.variant).toBe("normal");
  });
  it("does not invent an unlocked special form for normal or unknown cards", () => {
    const source = forms({ 1: "unknown", 3: "unknown" });
    const result = layoutDeck(source, {});
    expect(result.slots).toEqual(source);
    expect(result.cells.every((cell) => !cell.active && !cell.conflict)).toBe(
      true,
    );
    expect(result.cells[1].formLabel).toBe("形态未记录");
    expect(result.cells[0].formLabel).toBe("普通卡牌");
  });
  it("flags excess special forms instead of silently dropping or activating them", () => {
    const result = layoutDeck(
      forms({ 0: "evolution", 1: "evolution", 2: "hero", 3: "hero" }),
      {},
    );
    expect(result.cells.filter((cell) => cell.active)).toHaveLength(3);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].slot.variant).toBe("hero");
    expect(result.slots).toHaveLength(8);
    expect(new Set(result.slots.map((slot) => slot.id)).size).toBe(8);
  });
  it("keeps the source and favorite identity intact while exporting the display order", async () => {
    const source = forms({ 4: "hero", 6: "evolution" });
    const original = structuredClone(source);
    const result = layoutDeck(source, {});
    expect(source).toEqual(original);
    expect(await deckIdentity("global", source)).toBe(
      await deckIdentity("global", result.slots),
    );
    expect(
      copyDeckUrl(result.slots).split("deck=")[1].split(";").map(Number),
    ).toEqual(result.cells.map((cell) => cell.slot.id));
  });
  it("rejects incomplete or duplicate compositions", () => {
    expect(() => layoutDeck(base.slice(1), {})).toThrow();
    expect(() => layoutDeck([...base.slice(1), base[1]], {})).toThrow();
  });
});
