import { z } from "zod";
const https = z
  .string()
  .url()
  .max(2000)
  .refine((v) => new URL(v).protocol === "https:");
const image = https.refine((v) =>
  [
    "raw.githubusercontent.com",
    "api-assets.clashroyale.com",
    "cdn.royaleapi.com",
    "cdns3.royaleapi.com",
  ].includes(new URL(v).hostname),
);
export const cardSchema = z.object({
  id: z.number().int().min(26000000).max(29999999),
  key: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .max(100),
  name: z.string().min(1).max(150),
  name_en: z.string().min(1).max(150),
  description: z.string().max(5000),
  type: z.string().min(1).max(50),
  rarity: z.string().min(1).max(50),
  elixir: z.number().int().min(0).max(20),
  arena: z.number().int().min(0).max(100).nullable(),
  image_url: image.nullable(),
  stats: z.record(z.string().max(150), z.record(z.string().max(150), z.json())),
});
export const releaseSchema = z
  .object({
    stream: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(60),
    revision: z.string().min(1).max(150),
    source_url: https,
    source_updated_at: z.iso.datetime(),
    observed_at: z.iso.datetime(),
    title: z.string().min(1).max(200),
    cards: z.array(cardSchema).min(1).max(500),
  })
  .superRefine((v, c) => {
    if (
      new Set(v.cards.map((x) => x.id)).size !== v.cards.length ||
      new Set(v.cards.map((x) => x.key)).size !== v.cards.length
    )
      c.addIssue({ code: "custom", message: "Duplicate card identity" });
  });
export const slotSchema = z.object({
  id: z.number().int().min(26000000).max(29999999),
  variant: z.enum(["normal", "evolution", "hero", "unknown"]),
});
export const deckSchema = z
  .object({
    region: z.literal("global"),
    slots: z.array(slotSchema).length(8),
    source: z
      .string()
      .regex(/^[a-z0-9-]+$/)
      .max(60),
    source_url: https,
    title: z.string().min(1).max(200),
    kind: z.enum(["preset", "player", "community"]),
    observed_at: z.iso.datetime(),
  })
  .refine(
    (v) => new Set(v.slots.map((x) => x.id)).size === 8,
    "Deck must contain eight unique cards",
  );
export const decksSchema = z.object({
  decks: z.array(deckSchema).min(1).max(50),
});
export const runSchema = z.object({
  id: z.string().uuid(),
  source: z.string().max(60),
  started_at: z.iso.datetime(),
  finished_at: z.iso.datetime(),
  status: z.enum(["success", "failed", "blocked"]),
  count: z.number().int().min(0),
  message: z.string().max(1000),
});
export type Card = z.infer<typeof cardSchema>;
export type ReleaseInput = z.infer<typeof releaseSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type DeckInput = z.infer<typeof deckSchema>;
export type Release = {
  id: string;
  stream: string;
  parent_id: string | null;
  content_hash: string;
  revision: string;
  source_url: string;
  source_updated_at: string;
  observed_at: string;
  card_count: number;
  change_count: number;
  title: string;
  latest_source_updated_at?: string;
  last_observed_at?: string;
};
export type FieldChange = {
  path: string;
  before: unknown;
  after: unknown;
  percent: number | null;
};
export type CardChange = {
  card_id: number;
  kind: "added" | "removed" | "modified";
  fields: FieldChange[];
  name?: string;
  image_url?: string | null;
};
export type Deck = {
  id: string;
  region: string;
  slots: Slot[];
  created_at: string;
  last_seen_at: string;
  name?: string;
  slot_order?: "explicit";
  origins: {
    source: string;
    source_url: string;
    title: string;
    kind: string;
    observed_at: string;
  }[];
};
