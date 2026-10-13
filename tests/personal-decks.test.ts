import { describe, expect, it } from "vitest";
import {
  allowedForms,
  createPersonalDeck,
  parsePersonalDecks,
  putCard,
  serializePersonalDecks,
  swapCards,
  validateDraft,
  type DraftSlot,
  adaptDeck,
  deckCardDictionary,
} from "../shared/personal-decks";
import { builderCards } from "../worker/builder-feed";
import { layoutDeck, cardForForm } from "../shared/deck-layout";

const cards = Object.fromEntries(builderCards.map((card) => [card.id, card]));
const draft: DraftSlot[] = [
  { id: 26000000, variant: "normal" },
  { id: 26000023, variant: "hero" },
  { id: 27000000, variant: "evolution" },
  { id: 28000015, variant: "normal" },
  { id: 26000010, variant: "normal" },
  { id: 28000000, variant: "normal" },
  { id: 28000011, variant: "normal" },
  { id: 26000021, variant: "normal" },
];

describe("personal deck building", () => {
  it("adapts the reported classic X-Bow composition using compatible cards without rewriting the source", () => {
    const source = [
      27000008, 26000038, 26000030, 26000010, 27000006, 26000001, 28000011,
      28000000,
    ].map((id) => ({ id, variant: "normal" as const }));
    const draft = adaptDeck(source, cards);
    expect(draft.slice(0, 3)).toEqual([
      { id: 26000030, variant: "evolution" },
      { id: 26000038, variant: "hero" },
      { id: 26000010, variant: "evolution" },
    ]);
    expect(validateDraft(draft, cards)).toBeNull();
    expect(draft.map((slot) => slot!.id).sort()).toEqual(
      source.map((slot) => slot.id).sort(),
    );
    expect(source.every((slot) => slot.variant === "normal")).toBe(true);
    expect(draft.find((slot) => slot!.id === 27000008)?.variant).toBe("normal");
  });
  it("renders verified special-form images instead of ordinary portraits", () => {
    for (const card of builderCards) {
      for (const variant of card.forms.filter((form) => form !== "normal")) {
        expect(card.form_images?.[variant]).toMatch(/^https:\/\//);
        expect(cardForForm(card, variant)?.image_url).not.toBe(card.image_url);
      }
    }
    const unavailable = { ...cards[26000000], form_images: {} };
    expect(cardForForm(unavailable, "evolution")?.image_url).toBeNull();
    expect(cardForForm(unavailable, "normal")?.image_url).toBe(
      unavailable.image_url,
    );
  });
  it("enriches old saved card snapshots with new form images", () => {
    const deck = createPersonalDeck("旧卡组", draft, cards);
    deck.cards = deck.cards.map(({ form_images, ...card }) => card);
    const enriched = deckCardDictionary(deck, cards);
    expect(cardForForm(enriched[27000000], "evolution")?.image_url).toBe(
      cards[27000000].form_images?.evolution,
    );
  });
  it("offers only catalogued forms compatible with each slot", () => {
    expect(allowedForms(cards[27000000], 0)).toEqual(["normal", "evolution"]);
    expect(allowedForms(cards[27000000], 1)).toEqual(["normal"]);
    expect(allowedForms(cards[26000023], 1)).toContain("hero");
    expect(allowedForms(cards[26000000], 2)).toEqual([
      "normal",
      "evolution",
      "hero",
    ]);
    expect(allowedForms(cards[26000000], 5)).toEqual(["normal"]);
    expect(allowedForms(cards[26000074], 5)).toEqual([]);
    expect(allowedForms(cards[26000074], 1)).toEqual(["normal"]);
  });
  it("requires eight unique, known, compatible cards before saving", () => {
    expect(validateDraft(draft, cards)).toBeNull();
    expect(validateDraft([...draft.slice(0, 7), null], cards)).toMatch(/填满/);
    expect(validateDraft([...draft.slice(0, 7), draft[0]], cards)).toMatch(
      /一次/,
    );
    expect(
      validateDraft(
        draft.map((slot, i) =>
          i === 5 ? { id: 26000000, variant: "hero" } : slot,
        ),
        cards,
      ),
    ).not.toBeNull();
    expect(validateDraft(draft, {})).toMatch(/暂不可用/);
  });
  it("freely switches every dual-form wild card while preserving deck identity, portraits and selected forms", () => {
    const dualCards = builderCards.filter(
      (card) => card.forms.includes("evolution") && card.forms.includes("hero"),
    );
    expect(dualCards.length).toBeGreaterThan(0);
    for (const card of dualCards) {
      const otherIds = builderCards
        .filter((other) => other.id !== card.id && other.rarity !== "Champion")
        .slice(0, 7)
        .map((other) => other.id);
      let slots: DraftSlot[] = otherIds.map((id) => ({
        id,
        variant: "normal",
      }));
      slots.splice(2, 0, { id: card.id, variant: "evolution" });
      let deck = createPersonalDeck("混合槽", slots, cards);
      const identity = deck.id;
      const ids = slots.map((slot) => slot!.id);
      for (const variant of ["hero", "evolution", "normal", "hero"] as const) {
        slots = putCard(slots, 2, card, variant);
        deck = parsePersonalDecks(
          serializePersonalDecks([
            createPersonalDeck(deck.name, slots, cards, deck),
          ]),
        )[0];
        expect(deck.id).toBe(identity);
        expect(deck.slots.map((slot) => slot.id)).toEqual(ids);
        expect(deck.slots[2].variant).toBe(variant);
        expect(
          cardForForm(deckCardDictionary(deck, cards)[card.id], variant)
            ?.image_url,
        ).toBe(
          variant === "normal" ? card.image_url : card.form_images?.[variant],
        );

      }
    }
  });
  it("rejects duplicates and unsupported hero forms without changing the draft", () => {
    const original = structuredClone(draft);
    expect(() => putCard(draft, 4, cards[26000000], "normal")).toThrow(/已在/);
    expect(() => putCard(draft, 3, cards[26000023], "hero")).toThrow(/不支持/);
    expect(draft).toEqual(original);
  });
  it("downgrades a moved evolution to normal in a regular slot, without mutating the source", () => {
    const next = swapCards(draft, 2, 5, cards);
    expect(next[5]).toEqual({ id: 27000000, variant: "normal" });
    expect(next[2]).toEqual({ id: 28000000, variant: "normal" });
    expect(draft[2]?.variant).toBe("evolution");
    expect(validateDraft(next, cards)).toBeNull();
  });
  it("automatically reroutes a moved Champion and keeps all eight cards", () => {
    const before = putCard(draft, 1, cards[26000074], "normal");
    const next = swapCards(before, 1, 5, cards);
    expect(next[2]?.id).toBe(26000074);
    expect(next.map((slot) => slot!.id).sort()).toEqual(
      before.map((slot) => slot!.id).sort(),
    );
    expect(validateDraft(next, cards)).toBeNull();
  });
  it("persists exact user positions, metadata and a stable ID across edits", () => {
    const deck = createPersonalDeck(" 我的主卡组 ", draft, cards);
    expect(deck.name).toBe("我的主卡组");
    const restored = parsePersonalDecks(serializePersonalDecks([deck]))[0];
    expect(restored.slots).toEqual(draft);
    expect(restored.cards).toHaveLength(8);
    expect(restored.slot_order).toBe("explicit");
    const arranged = layoutDeck(restored.slots, cards, { preserveOrder: true });
    expect(arranged.slots).toEqual(draft);
    expect(arranged.cells[2].slot.id).toBe(27000000);
    const renamed = createPersonalDeck("改名", draft, cards, restored);
    expect(renamed.id).toBe(deck.id);
    expect(renamed.created_at).toBe(deck.created_at);
  });
  it("saves the selected special form locally without a public favorite", () => {
    const deck = createPersonalDeck("测试卡组", draft, cards);
    expect(deck.slots[2]).toEqual({ id: 27000000, variant: "evolution" });
    expect(deck.id).toMatch(/^local:/);
    expect(deck.origins).toEqual([]);
  });
  it("rejects malformed or conflicting persisted decks", () => {
    expect(() => parsePersonalDecks("garbage")).toThrow();
    const deck = createPersonalDeck("测试卡组", draft, cards);
    expect(() =>
      parsePersonalDecks(
        JSON.stringify({
          version: 1,
          decks: [{ ...deck, slots: draft.slice(1) }],
        }),
      ),
    ).toThrow();
    expect(() =>
      parsePersonalDecks(JSON.stringify({ version: 1, decks: [deck, deck] })),
    ).toThrow();
    expect(() => createPersonalDeck(" ", draft, cards)).toThrow();
  });
  it("exposes the existing 123 base identities with Chinese search names and source-backed forms", () => {
    expect(builderCards).toHaveLength(123);
    expect(cards[27000000].name).toBe("加农炮");
    expect(cards[27000000].name_en).toBe("Cannon");
    expect(cards[26000023].forms).toContain("hero");
    expect(builderCards.every((card) => card.forms.includes("normal"))).toBe(
      true,
    );
  });
});
