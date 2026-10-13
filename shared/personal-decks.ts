import { z } from "zod";
import type { Deck, Slot } from "./schema";
import { slotKindAt, slotNames, type DeckCard } from "./deck-layout";

export const PERSONAL_KEY = "royale-personal-decks-v1";
export const MAX_PERSONAL_DECKS = 10;
export const forms = ["normal", "evolution", "hero"] as const;
export type CardForm = (typeof forms)[number];
export const formNames: Record<CardForm, string> = {
  normal: "普通",
  evolution: "觉醒",
  hero: "精英",
};
const builderCardSchema = z.object({
  id: z.number().int().min(26000000).max(29999999),
  key: z.string().max(100),
  name: z.string().min(1).max(150),
  name_en: z.string().max(150),
  image_url: z
    .string()
    .url()
    .refine((url) => new URL(url).protocol === "https:")
    .nullable(),
  elixir: z.number().int().min(0).max(20),
  rarity: z.string().max(50),
  type: z.string().max(50),
  forms: z.array(z.enum(forms)).min(1).max(3),
  form_images: z
    .object({
      evolution: z.string().url().startsWith("https:").optional(),
      hero: z.string().url().startsWith("https:").optional(),
    })
    .optional(),
});
export type BuilderCard = z.infer<typeof builderCardSchema>;
export type DraftSlot = { id: number; variant: CardForm } | null;
export const draftSchema = z.object({
  name: z.string().max(50),
  slots: z
    .array(
      z
        .object({
          id: z.number().int().min(26000000).max(29999999),
          variant: z.enum(forms),
        })
        .nullable(),
    )
    .length(8),
});

export function allowedForms(card: BuilderCard, position: number): CardForm[] {
  const kind = slotKindAt(position);
  if (card.rarity === "Champion")
    return kind === "hero" || kind === "wild" ? ["normal"] : [];
  return forms.filter(
    (form) =>
      card.forms.includes(form) &&
      (form === "normal" || kind === "wild" || kind === form),
  );
}
export function defaultForm(
  card: BuilderCard,
  position: number,
  preferred?: CardForm,
): CardForm | undefined {
  const allowed = allowedForms(card, position);
  if (
    slotKindAt(position) === "wild" &&
    preferred &&
    preferred !== "normal" &&
    allowed.includes(preferred)
  )
    return preferred;
  return allowed.find((form) => form !== "normal") ?? allowed[0];
}
export function wildSwitchForms(card: BuilderCard): CardForm[] {
  return allowedForms(card, 2).filter((form) => form !== "normal");
}

export function championDestination(
  slots: DraftSlot[],
  cards: Record<number, BuilderCard>,
): number {
  const score = (position: number) =>
    !slots[position]
      ? 0
      : cards[slots[position]!.id]?.rarity === "Champion"
        ? 3
        : slots[position]!.variant === "normal"
          ? 1
          : 2;
  return [1, 2].sort((a, b) => score(a) - score(b))[0];
}

// Editor-only routing. Public source observations must never be normalized here.
export function normalizeEditorSlots(
  slots: DraftSlot[],
  cards: Record<number, BuilderCard>,
  avoid: number[] = [],
): DraftSlot[] {
  const next = [...slots];
  if (
    next.filter((slot) => slot && cards[slot.id]?.rarity === "Champion")
      .length > 2
  )
    throw new Error("标准卡组最多配置两张英雄牌。");
  for (let i = 0; i < next.length; i++) {
    const slot = next[i];
    if (!slot || cards[slot.id]?.rarity !== "Champion" || i === 1 || i === 2)
      continue;
    const destination = [1, 2]
      .filter((p) => !next[p] || cards[next[p]!.id]?.rarity !== "Champion")
      .sort(
        (a, b) =>
          Number(avoid.includes(a)) - Number(avoid.includes(b)) ||
          Number(Boolean(next[a])) - Number(Boolean(next[b])),
      )[0];
    [next[i], next[destination]] = [next[destination], next[i]];
  }
  return next.map((slot, position) => {
    if (!slot) return null;
    const card = cards[slot.id];
    if (!card) throw new Error("部分卡牌资料暂不可用。");
    const variant = defaultForm(card, position, slot.variant);
    if (!variant) throw new Error("英雄牌自动排位失败。");
    return { id: slot.id, variant };
  });
}

export function placeEditorCard(
  slots: DraftSlot[],
  requested: number,
  card: BuilderCard,
  cards: Record<number, BuilderCard>,
): { slots: DraftSlot[]; position: number; message: string } {
  if (slots.some((slot, i) => i !== requested && slot?.id === card.id))
    throw new Error("该卡牌已在卡组中。");
  const champion = card.rarity === "Champion";
  const position =
    champion && requested !== 1 && requested !== 2
      ? championDestination(slots, cards)
      : requested;
  const displaced = slots[position];
  const replacingChampion =
    champion &&
    displaced &&
    cards[displaced.id]?.rarity === "Champion" &&
    displaced.id !== card.id;
  const next = [...slots];
  let message = champion
    ? `已将${card.name}放入${slotNames[slotKindAt(position)]}。`
    : "";
  if (replacingChampion) {
    const atCapacity =
      slots.filter((slot) => slot && cards[slot.id]?.rarity === "Champion")
        .length === 2;
    message = `已用${card.name}替换${cards[displaced.id].name}。${atCapacity ? "英雄牌最多配置两张。" : ""}`;
  } else if (position !== requested) {
    next[requested] = displaced
      ? {
          id: displaced.id,
          variant: defaultForm(
            cards[displaced.id],
            requested,
            displaced.variant,
          )!,
        }
      : null;
    message = `已将${card.name}自动放入${slotNames[slotKindAt(position)]}。`;
  }
  const variant = defaultForm(card, position);
  if (!variant) throw new Error("卡牌形态资料暂不可用。");
  return { slots: putCard(next, position, card, variant), position, message };
}
export function validateDraft(
  slots: DraftSlot[],
  cards: Record<number, BuilderCard>,
): string | null {
  if (slots.length !== 8 || slots.some((slot) => !slot))
    return "还差卡牌，请填满 8 个槽位。";
  if (new Set(slots.map((slot) => slot!.id)).size !== 8)
    return "同一张卡牌只能使用一次。";
  if (
    slots.filter((slot) => slot && cards[slot.id]?.rarity === "Champion")
      .length > 2
  )
    return "标准卡组最多配置两张英雄牌。";
  for (let i = 0; i < 8; i++) {
    const slot = slots[i]!;
    const card = cards[slot.id];
    if (!card) return `第 ${i + 1} 槽的卡牌资料暂不可用，请重新选择。`;
    if (!allowedForms(card, i).includes(slot.variant))
      return `第 ${i + 1} 槽不支持这张卡牌的当前形态。`;
  }
  return null;
}

// A user-confirmed adaptation draft, never a rewrite of source observations.
export function adaptDeck(
  slots: Slot[],
  cards: Record<number, BuilderCard>,
): DraftSlot[] {
  if (slots.length !== 8 || slots.some((slot) => !cards[slot.id]))
    throw new Error("原卡组的部分卡牌资料暂不可用，请重新选择。");
  if (slots.filter((slot) => cards[slot.id].rarity === "Champion").length > 2)
    throw new Error("此来源包含超过两张英雄牌，无法作为标准卡组适配。");
  let best: DraftSlot[] = [null, null, null];
  let bestScore = -1;
  const visit = (position: number, picked: DraftSlot[]) => {
    if (position === 3) {
      const count = picked.filter(Boolean).length;
      const dedicated = Number(Boolean(picked[0])) + Number(Boolean(picked[1]));
      const exact = picked.filter(
        (slot) =>
          slot &&
          slots.some(
            (source) =>
              source.id === slot.id && source.variant === slot.variant,
          ),
      ).length;
      const champions = picked.filter(
        (slot) => slot && cards[slot.id].rarity === "Champion",
      ).length;
      const score = champions * 1000 + count * 100 + dedicated * 10 + exact;
      if (score > bestScore) {
        bestScore = score;
        best = [...picked];
      }
      return;
    }
    for (const source of slots) {
      if (picked.some((slot) => slot?.id === source.id)) continue;
      const card = cards[source.id];
      const allowed = allowedForms(card, position).filter(
        (form) => form !== "normal" || card.rarity === "Champion",
      );
      for (const variant of allowed)
        visit(position + 1, [...picked, { id: source.id, variant }]);
    }
    visit(position + 1, [...picked, null]);
  };
  visit(0, []);
  const result: DraftSlot[] = [...best, ...Array<DraftSlot>(5).fill(null)];
  const remaining = slots.filter(
    (source) => !best.some((slot) => slot?.id === source.id),
  );
  for (let i = 0; i < 8; i++) {
    if (!result[i]) {
      const source = remaining.shift()!;
      result[i] = { id: source.id, variant: "normal" };
    }
  }
  return result;
}
export function putCard(
  slots: DraftSlot[],
  position: number,
  card: BuilderCard,
  variant: CardForm,
): DraftSlot[] {
  if (!allowedForms(card, position).includes(variant))
    throw new Error("该槽位不支持所选形态");
  if (slots.some((slot, i) => i !== position && slot?.id === card.id))
    throw new Error("该卡牌已在卡组中");
  return slots.map((slot, i) =>
    i === position ? { id: card.id, variant } : slot,
  );
}
export function swapCards(
  slots: DraftSlot[],
  from: number,
  to: number,
  cards: Record<number, BuilderCard>,
): DraftSlot[] {
  if (from === to) return [...slots];
  const next = [...slots];
  [next[from], next[to]] = [next[to], next[from]];
  return normalizeEditorSlots(next, cards, [from, to]);
}

const personalSchema = z
  .object({
    id: z.string().regex(/^local:[0-9a-f-]{36}$/),
    name: z.string().trim().min(1).max(50),
    slots: z
      .array(
        z.object({
          id: z.number().int().min(26000000).max(29999999),
          variant: z.enum(forms),
        }),
      )
      .length(8),
    cards: z.array(builderCardSchema).length(8),
    created_at: z.iso.datetime(),
    last_seen_at: z.iso.datetime(),
  })
  .superRefine((deck, ctx) => {
    const cards = Object.fromEntries(deck.cards.map((card) => [card.id, card]));
    const error =
      new Set(deck.cards.map((card) => card.id)).size !== 8
        ? "重复卡牌资料"
        : validateDraft(deck.slots, cards);
    if (error) ctx.addIssue({ code: "custom", message: error });
  });
export type PersonalDeck = Deck & {
  name: string;
  slot_order: "explicit";
  cards: BuilderCard[];
};
function asDeck(value: z.infer<typeof personalSchema>): PersonalDeck {
  return { ...value, region: "global", slot_order: "explicit", origins: [] };
}
export function parsePersonalDecks(raw: string | null): PersonalDeck[] {
  if (!raw) return [];
  const value = z
    .object({
      version: z.literal(1),
      decks: z.array(personalSchema).max(MAX_PERSONAL_DECKS),
    })
    .parse(JSON.parse(raw));
  if (new Set(value.decks.map((deck) => deck.id)).size !== value.decks.length)
    throw new Error("重复卡组 ID");
  return value.decks.map(asDeck);
}
export function serializePersonalDecks(decks: PersonalDeck[]) {
  const raw = JSON.stringify({ version: 1, decks });
  parsePersonalDecks(raw);
  return raw;
}
export function createPersonalDeck(
  name: string,
  slots: DraftSlot[],
  cards: Record<number, BuilderCard>,
  previous?: PersonalDeck,
): PersonalDeck {
  const now = new Date().toISOString();
  const value = personalSchema.parse({
    id: previous?.id ?? `local:${crypto.randomUUID()}`,
    name: name.trim(),
    slots,
    cards: slots.map((slot) => slot && cards[slot.id]),
    created_at: previous?.created_at ?? now,
    last_seen_at: now,
  });
  return asDeck(value);
}
export function isPersonalDeck(deck: Deck): deck is PersonalDeck {
  return deck.id.startsWith("local:") && "cards" in deck;
}
export function deckCardDictionary(
  deck: Deck,
  fallback: Record<number, DeckCard>,
): Record<number, DeckCard> {
  return isPersonalDeck(deck)
    ? {
        ...fallback,
        ...Object.fromEntries(
          deck.cards.map((card) => [
            card.id,
            {
              ...fallback[card.id],
              ...card,
              form_images: {
                ...fallback[card.id]?.form_images,
                ...card.form_images,
              },
            },
          ]),
        ),
      }
    : fallback;
}
