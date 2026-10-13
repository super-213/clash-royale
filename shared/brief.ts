import type { Card, Deck, Slot } from "./schema";
import type { DeckCard } from "./deck-layout";

export type BriefCard = Pick<
  Card,
  "id" | "name" | "image_url" | "rarity" | "elixir"
> &
  Pick<DeckCard, "form_images">;

export type BalanceFact = {
  metric: string;
  label: string;
  before: number;
  after: number;
  unit: string;
  sourcePercent: string | null;
  level: number | null;
};
export type BalanceEntry = {
  key: string;
  cardId: number;
  name: string;
  variant: Exclude<Slot["variant"], "unknown">;
  category: "buff" | "nerf" | "rework" | "bugfix";
  sourceUrl: string;
  facts: BalanceFact[];
  interpretation: string;
  watch: string;
};
export type BalanceEdition = {
  id: string;
  title: string;
  publishedOn: string;
  observedAt: string;
  effectiveAt: string | null;
  liveVersionVerified: boolean;
  sourceUrl: string;
  entries: BalanceEntry[];
};
export type BalanceMatch = {
  entry: BalanceEntry;
  certainty: "direct" | "variant_unknown" | "inheritance_unknown";
};

// Base changes may also affect special forms, but the announcement does not
// establish inheritance. Keep these separate from exact form matches.
export function matchDeck(
  slots: Slot[],
  edition: BalanceEdition,
): BalanceMatch[] {
  return edition.entries.flatMap((entry): BalanceMatch[] => {
    const slot = slots.find((s) => s.id === entry.cardId);
    if (!slot) return [];
    if (slot.variant === "unknown")
      return [{ entry, certainty: "variant_unknown" }];
    if (slot.variant === entry.variant) return [{ entry, certainty: "direct" }];
    if (entry.variant === "normal")
      return [{ entry, certainty: "inheritance_unknown" }];
    return [];
  });
}

export function summarizeDeck(deck: Deck, edition: BalanceEdition) {
  const matches = matchDeck(deck.slots, edition);
  return {
    deck,
    matches,
    directCards: new Set(
      matches
        .filter((m) => m.certainty === "direct")
        .map((m) => m.entry.cardId),
    ).size,
    possibleCards: new Set(
      matches
        .filter((m) => m.certainty !== "direct")
        .map((m) => m.entry.cardId),
    ).size,
  };
}

export const balanceCategory = {
  buff: "加强",
  nerf: "削弱",
  rework: "重做",
  bugfix: "修复",
};
export const balanceVariant = {
  normal: "普通",
  evolution: "觉醒",
  hero: "精英",
};
export const balanceUnit: Record<string, string> = {
  hitpoints: "点",
  tiles: "格",
  seconds: "秒",
  hits_per_second: "次/秒",
  elixir_per_second: "圣水/秒",
};
