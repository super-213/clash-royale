import { describe, expect, it } from "vitest";
import { builderCards } from "../worker/builder-feed";
import {
  adaptDeck,
  defaultForm,
  normalizeEditorSlots,
  placeEditorCard,
  swapCards,
  validateDraft,
  wildSwitchForms,
  type DraftSlot,
} from "../shared/personal-decks";
import { initialEditorState, reduceDeckEditor } from "../shared/deck-editor";
import { slotNames } from "../shared/deck-layout";
import { balanceVariant } from "../shared/brief";

const cards = Object.fromEntries(builderCards.map((card) => [card.id, card]));
const champions = builderCards.filter((card) => card.rarity === "Champion");
const basic = () =>
  adaptDeck(
    [
      27000008, 26000038, 26000030, 26000010, 27000006, 26000001, 28000011,
      28000000,
    ].map((id) => ({ id, variant: "normal" })),
    cards,
  );
const ids = (slots: DraftSlot[]) =>
  slots
    .filter(Boolean)
    .map((slot) => slot!.id)
    .sort();

describe("official standard deck rules, checked 2026-10-13", () => {
  it("uses official Simplified Chinese terms and distinguishes Heroes from Champions", () => {
    expect(slotNames).toEqual({
      evolution: "觉醒栏位",
      hero: "精英栏位",
      wild: "魔法栏位",
      regular: "普通栏位",
    });
    expect(balanceVariant).toEqual({
      normal: "普通",
      evolution: "觉醒",
      hero: "精英",
    });
    expect(cards[26000093].name).toBe("小王子");
    expect(cards[26000103].name).toBe("刺客头领");
    expect(cards[26000099].name).toBe("科学怪哥布林");
  });
  it("activates only the form appropriate to each position for every base card", () => {
    for (const card of builderCards) {
      for (let position = 0; position < 8; position++) {
        const expected =
          card.rarity === "Champion"
            ? position === 1 || position === 2
              ? "normal"
              : undefined
            : position === 0 && card.forms.includes("evolution")
              ? "evolution"
              : position === 1 && card.forms.includes("hero")
                ? "hero"
                : position === 2
                  ? card.forms.includes("evolution")
                    ? "evolution"
                    : card.forms.includes("hero")
                      ? "hero"
                      : "normal"
                  : "normal";
        expect(
          defaultForm(card, position),
          `${card.key} position ${position}`,
        ).toBe(expected);
      }
    }
  });
  it("routes every Champion from every clicked or dropped destination without losing unrelated cards", () => {
    for (const champion of champions) {
      for (let position = 0; position < 8; position++) {
        const before = basic();
        const result = placeEditorCard(before, position, champion, cards);
        expect([1, 2]).toContain(result.position);
        expect(result.slots[result.position]?.id).toBe(champion.id);
        expect(ids(result.slots)).toEqual(
          [
            ...ids(before).filter((id) => id !== before[position]!.id),
            champion.id,
          ].sort(),
        );
        expect(validateDraft(result.slots, cards)).toBeNull();
        expect(ids(before)).not.toContain(champion.id);
      }
    }
  });
  it("makes room for a second Champion and replaces a legal Champion for a third, never creating three", () => {
    let slots = basic();
    slots = placeEditorCard(slots, 1, champions[0], cards).slots;
    slots = placeEditorCard(slots, 5, champions[1], cards).slots;
    expect(slots[2]?.id).toBe(champions[1].id);
    const before = initialEditorState(slots);
    const next = reduceDeckEditor(
      before,
      { type: "choose", id: champions[2].id },
      cards,
    );
    expect(
      next.slots.filter((slot) => slot && cards[slot.id].rarity === "Champion"),
    ).toHaveLength(2);
    expect(next.slots[1]?.id).toBe(champions[2].id);
    expect(next.message).toContain("替换");
    expect(next.message).toContain("两张");
    expect(validateDraft(next.slots, cards)).toBeNull();
    expect(reduceDeckEditor(next, { type: "undo" }, cards).slots).toEqual(
      slots,
    );
  });
  it("replaces only a Champion at capacity from every requested position", () => {
    let before = placeEditorCard(basic(), 1, champions[0], cards).slots;
    before = placeEditorCard(before, 2, champions[1], cards).slots;
    for (let position = 0; position < 8; position++) {
      const result = placeEditorCard(before, position, champions[2], cards);
      expect(
        result.slots.filter(
          (slot) => slot && cards[slot.id].rarity === "Champion",
        ),
      ).toHaveLength(2);
      expect(result.message).toMatch(/替换/);
      expect(validateDraft(result.slots, cards)).toBeNull();
      expect(ids(result.slots)).toEqual(
        [
          ...ids(before).filter((id) => id !== before[result.position]!.id),
          champions[2].id,
        ].sort(),
      );
      if (position !== 1 && position !== 2)
        expect(result.slots[position]).toEqual(before[position]);
    }
  });
  it("rejects a source with more than two Champions without silently removing any", () => {
    const source = [
      champions[0].id,
      champions[1].id,
      champions[2].id,
      26000000,
      26000001,
      26000010,
      28000000,
      28000011,
    ].map((id) => ({ id, variant: "normal" as const }));
    const original = structuredClone(source);
    expect(() => adaptDeck(source, cards)).toThrow(/两张英雄/);
    expect(() => normalizeEditorSlots(source, cards)).toThrow(/两张英雄/);
    expect(source).toEqual(original);
  });
  it("preserves all eight IDs and legal Champion positions for every drag-swap pair", () => {
    let before = basic();
    before = placeEditorCard(before, 1, champions[0], cards).slots;
    before = placeEditorCard(before, 2, champions[1], cards).slots;
    for (let from = 0; from < 8; from++)
      for (let to = 0; to < 8; to++) {
        const after = swapCards(before, from, to, cards);
        expect(ids(after)).toEqual(ids(before));
        expect(validateDraft(after, cards)).toBeNull();
        expect(
          after.filter((slot) => slot && cards[slot.id].rarity === "Champion"),
        ).toHaveLength(2);
      }
  });
  it("switches ordinary cards on movement and retains a chosen special form only in the Wild Slot", () => {
    const knight = cards[26000000];
    expect(defaultForm(knight, 0, "normal")).toBe("evolution");
    expect(defaultForm(knight, 1, "evolution")).toBe("hero");
    expect(defaultForm(knight, 2, "hero")).toBe("hero");
    expect(defaultForm(knight, 5, "hero")).toBe("normal");
    expect(wildSwitchForms(knight)).toEqual(["evolution", "hero"]);
    const slots = basic();
    slots[4] = { id: knight.id, variant: "normal" };
    expect(swapCards(slots, 4, 0, cards)[0]?.variant).toBe("evolution");
    expect(swapCards(slots, 4, 1, cards)[1]?.variant).toBe("hero");
  });
  it("prioritizes both Champions when adapting a source and does not alter the source observation", () => {
    const source = [
      champions[0].id,
      champions[1].id,
      26000014,
      26000000,
      26000010,
      26000001,
      28000000,
      28000011,
    ].map((id) => ({ id, variant: "normal" as const }));
    const adapted = adaptDeck(source, cards);
    expect(adapted[1]?.id).toBe(champions[0].id);
    expect(adapted[2]?.id).toBe(champions[1].id);
    expect(ids(adapted)).toEqual(ids(source));
    expect(validateDraft(adapted, cards)).toBeNull();
    expect(source.every((slot) => slot.variant === "normal")).toBe(true);
  });
  it("normalizes old editable snapshots but keeps explicit Wild Slot special choices", () => {
    const slots = basic();
    slots[0] = { id: 26000000, variant: "normal" };
    slots[2] = { id: 26000014, variant: "hero" };
    const normalized = normalizeEditorSlots(slots, cards);
    expect(normalized[0]?.variant).toBe("evolution");
    expect(normalized[2]?.variant).toBe("hero");
    expect(ids(normalized)).toEqual(ids(slots));
    expect(slots[0]?.variant).toBe("normal");
  });
});
