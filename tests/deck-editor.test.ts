import { describe, expect, it } from "vitest";
import {
  initialEditorState,
  reduceDeckEditor,
  type EditorAction,
  type EditorState,
} from "../shared/deck-editor";
import { builderCards } from "../worker/builder-feed";
import {
  adaptDeck,
  createPersonalDeck,
  parsePersonalDecks,
  serializePersonalDecks,
  validateDraft,
  type DraftSlot,
} from "../shared/personal-decks";

const cards = Object.fromEntries(builderCards.map((card) => [card.id, card]));
const empty = () => initialEditorState(Array<DraftSlot>(8).fill(null));
const full = () =>
  initialEditorState(
    adaptDeck(
      [
        27000008, 26000038, 26000030, 26000010, 27000006, 26000001, 28000011,
        28000000,
      ].map((id) => ({ id, variant: "normal" })),
      cards,
    ),
  );
const act = (state: EditorState, action: EditorAction) =>
  reduceDeckEditor(state, action, cards);

describe("direct deck editing", () => {
  it("selects a tower without moving cards and undoes only the last tower or card change", () => {
    const before = full();
    const tower = act(before, { type: "tower", value: "cannoneer" });
    expect(tower.towerTroop).toBe("cannoneer");
    expect(tower.slots).toBe(before.slots);
    expect(tower.target).toBe(before.target);
    expect(act(tower, { type: "undo" }).towerTroop).toBe("tower-princess");
    const changed = act(tower, { type: "drop", id: 26000014, position: 2 });
    const undone = act(changed, { type: "undo" });
    expect(undone.towerTroop).toBe("cannoneer");
    expect(undone.slots).toEqual(before.slots);
    expect(act(tower, { type: "tower", value: "cannoneer" }).undo).toBe(tower.undo);
    expect(act(tower, { type: "seed", slots: before.slots }).towerTroop).toBe("cannoneer");
  });
  it("fills empty slots with one click and advances, including a compatible empty slot for Champions", () => {
    let state = act(empty(), { type: "choose", id: 26000030 });
    expect(state.slots[0]).toEqual({ id: 26000030, variant: "evolution" });
    expect(state.target).toBe(1);
    state = act(state, { type: "choose", id: 26000038 });
    expect(state.slots[1]?.variant).toBe("hero");
    expect(state.target).toBe(2);
    const champion = act(empty(), { type: "choose", id: 26000074 });
    expect(champion.slots[0]).toBeNull();
    expect(champion.slots[1]?.id).toBe(26000074);
  });
  it("supports both replacement orders without altering the deck on card-first selection", () => {
    const before = full();
    const pending = act(before, { type: "choose", id: 26000014 });
    expect(pending.slots).toBe(before.slots);
    expect(pending.undo).toBeNull();
    const cardFirst = act(pending, { type: "select", position: 2 });
    const slotFirst = act(act(before, { type: "select", position: 2 }), {
      type: "choose",
      id: 26000014,
    });
    expect(cardFirst.slots).toEqual(slotFirst.slots);
    expect(cardFirst.slots[2]).toEqual({ id: 26000014, variant: "evolution" });
    expect(validateDraft(cardFirst.slots, cards)).toBeNull();
    expect(cardFirst.candidateId).toBeNull();
  });
  it("automatically routes a Champion after a regular slot is selected and undoes the whole rearrangement", () => {
    const before = full();
    const selected = act(before, { type: "select", position: 4 });
    const routed = act(selected, { type: "choose", id: 26000074 });
    expect(routed.slots[1]?.id).toBe(26000074);
    expect(routed.slots[4]?.id).toBe(before.slots[1]?.id);
    expect(routed.slots.some((slot) => slot?.id === before.slots[4]?.id)).toBe(
      false,
    );
    expect(routed.message).toMatch(/自动放入/);
    expect(validateDraft(routed.slots, cards)).toBeNull();
    expect(act(routed, { type: "undo" }).slots).toEqual(before.slots);
  });
  it("drops into the actual destination, chooses its form and rejects duplicates without consuming undo", () => {
    const before = full();
    const dropped = act(before, { type: "drop", id: 26000014, position: 1 });
    expect(dropped.slots[1]).toEqual({ id: 26000014, variant: "hero" });
    const duplicate = act(dropped, { type: "drop", id: 26000014, position: 4 });
    expect(duplicate.slots).toBe(dropped.slots);
    expect(duplicate.undo).toBe(dropped.undo);
    expect(before.undo).toBeNull();
  });
  it("undoes only the last mutation; selection and cancellation do not consume undo", () => {
    const initial = full();
    const first = act(initial, { type: "drop", id: 26000014, position: 2 });
    const second = act(first, { type: "form", position: 2, value: "hero" });
    const inspected = act(act(second, { type: "select", position: 4 }), {
      type: "cancel-choice",
    });
    const undone = act(inspected, { type: "undo" });
    expect(undone.slots).toEqual(first.slots);
    expect(undone.undo).toBeNull();
    expect(act(undone, { type: "undo" }).slots).toEqual(first.slots);
    const saved = parsePersonalDecks(
      serializePersonalDecks([
        createPersonalDeck("快捷配卡", undone.slots, cards),
      ]),
    )[0];
    expect(saved.slots).toEqual(first.slots);
  });
  it("undoes additions, removals, click swaps and drag swaps including special-form changes", () => {
    const added = act(empty(), { type: "choose", id: 26000030 });
    expect(act(added, { type: "undo" }).slots.every((slot) => !slot)).toBe(
      true,
    );
    const before = full();
    const selected = act(before, { type: "select", position: 0 });
    const removed = act(selected, { type: "remove" });
    expect(removed.slots[0]).toBeNull();
    expect(act(removed, { type: "undo" }).slots).toEqual(before.slots);
    const clickSwap = act(act(selected, { type: "swap-mode" }), {
      type: "select",
      position: 4,
    });
    const dragSwap = act(before, { type: "move", from: 0, to: 4 });
    expect(clickSwap.slots).toEqual(dragSwap.slots);
    expect(dragSwap.slots[4]?.variant).toBe("normal");
    expect(act(dragSwap, { type: "undo" }).slots).toEqual(before.slots);
  });
});
