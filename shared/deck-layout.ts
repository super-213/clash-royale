import type { Card, Slot } from "./schema";

export type DeckCard = Pick<Card, "name" | "image_url"> &
  Partial<Pick<Card, "elixir" | "rarity">> & {
    form_images?: Partial<Record<"evolution" | "hero", string>>;
  };
export type DisplayCard = DeckCard & Pick<Card, "id" | "elixir">;
export function cardForForm(
  card: DeckCard | undefined,
  variant: Slot["variant"],
): DeckCard | undefined {
  if (!card || variant === "normal" || variant === "unknown") return card;
  return {
    ...card,
    name: `${card.name} · ${variant === "evolution" ? "觉醒" : "精英"}`,
    image_url: card.form_images?.[variant] ?? null,
  };
}
export type SlotKind = "evolution" | "hero" | "wild" | "regular";
export type DeckCell = {
  position: number;
  kind: SlotKind;
  slot: Slot;
  active: boolean;
  conflict: boolean;
  formLabel: string;
};
export const slotNames: Record<SlotKind, string> = {
  evolution: "觉醒栏位",
  hero: "精英栏位",
  wild: "魔法栏位",
  regular: "普通栏位",
};
export const slotHelp: Record<SlotKind, string> = {
  evolution: "有对应形态且已解锁时激活觉醒。",
  hero: "有对应形态且已解锁时激活精英，也可使用英雄牌。",
  wild: "可使用觉醒形态、精英形态（Hero）或英雄牌（Champion）。",
  regular: "普通栏位，不激活觉醒或精英形态。",
};
export const slotKindAt = (position: number): SlotKind =>
  position === 0
    ? "evolution"
    : position === 1
      ? "hero"
      : position === 2
        ? "wild"
        : "regular";

// Source arrays currently describe composition, not verified game positions.
// Arrange known forms into the current Evo / Hero / Wild layout without
// mutating the source or turning a normal/unknown card into a special form.
export function layoutDeck(
  slots: Slot[],
  cards: Record<number, DeckCard>,
  options: { preserveOrder?: boolean } = {},
) {
  if (slots.length !== 8 || new Set(slots.map((s) => s.id)).size !== 8) {
    throw new Error("A deck layout needs eight unique cards");
  }
  const isChampion = (slot: Slot) =>
    slot.variant === "normal" && cards[slot.id]?.rarity === "Champion";
  const isHero = (slot: Slot) => slot.variant === "hero" || isChampion(slot);
  const isSpecial = (slot: Slot) =>
    slot.variant === "evolution" || isHero(slot);
  const ordered: (Slot | undefined)[] = Array(8).fill(undefined);
  const used = new Set<number>();
  const place = (position: number, accepts: (slot: Slot) => boolean) => {
    const slot = slots.find((s) => !used.has(s.id) && accepts(s));
    if (slot) {
      ordered[position] = slot;
      used.add(slot.id);
    }
  };
  if (options.preserveOrder) {
    slots.forEach((slot, position) => {
      ordered[position] = slot;
      used.add(slot.id);
    });
  } else {
    place(0, (slot) => slot.variant === "evolution");
    place(1, isHero);
    place(2, isSpecial);
  }
  // Retain source-relative order for all remaining cards.
  for (let i = 0; i < 8; i++) {
    if (!ordered[i]) place(i, () => true);
  }
  const cells: DeckCell[] = ordered.map((value, position) => {
    const slot = value!;
    const kind = slotKindAt(position);
    const special = isSpecial(slot);
    const fits =
      kind === "wild" ||
      (kind === "evolution" && slot.variant === "evolution") ||
      (kind === "hero" && isHero(slot));
    return {
      position,
      kind,
      slot,
      active: special && fits,
      conflict: special && !fits,
      formLabel:
        slot.variant === "unknown"
          ? "形态未记录"
          : slot.variant === "evolution"
            ? "觉醒形态"
            : slot.variant === "hero"
              ? "精英形态"
              : isChampion(slot)
                ? "英雄牌"
                : "普通卡牌",
    };
  });
  return {
    cells,
    slots: cells.map((cell) => cell.slot),
    conflicts: cells.filter((cell) => cell.conflict),
  };
}
