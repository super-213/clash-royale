import { z } from "zod";
import { forms } from "./personal-decks";
import { towerTroopSchema } from "./tower-troops";

const shareSchema = z.object({
  version: z.literal(1),
  name: z.string().trim().min(1).max(50),
  slots: z.array(z.object({
    id: z.number().int().min(26000000).max(29999999),
    variant: z.enum(forms),
  }).strict()).length(8),
  tower_troop: towerTroopSchema,
}).strict().refine((deck) => new Set(deck.slots.map((slot) => slot.id)).size === 8);

export type SharedDeck = z.infer<typeof shareSchema>;
export type ShareableDeck = Pick<SharedDeck, "name" | "slots" | "tower_troop">;

// Only composition travels in the fragment: no local identity, dates or card URLs.
// The receiver validates card/form support against its own catalog before saving.
export function fullDeckUrl(deck: ShareableDeck, baseUrl: string): string {
  const value = shareSchema.parse({ version: 1, name: deck.name, slots: deck.slots, tower_troop: deck.tower_troop });
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const payload = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const url = new URL(baseUrl);
  url.search = "?view=brief";
  url.hash = `deck=${payload}`;
  return url.href;
}

export function readSharedDeck(hash: string): SharedDeck | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.has("deck")) return null;
  try {
    const payload = params.get("deck")!;
    if (!/^[A-Za-z0-9_-]{1,2048}$/.test(payload)) throw new Error();
    const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    return shareSchema.parse(JSON.parse(json));
  } catch {
    throw new Error("分享链接无效或版本暂不支持，请重新复制完整配置链接。");
  }
}
