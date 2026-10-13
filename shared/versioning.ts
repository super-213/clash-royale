import type { Card, CardChange, FieldChange, Slot } from "./schema";
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonical((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}
export async function digest(value: string): Promise<string> {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function fieldsDiff(
  before: unknown,
  after: unknown,
  path = "",
): FieldChange[] {
  if (canonical(before ?? null) === canonical(after ?? null)) return [];
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    Array.isArray(before) === Array.isArray(after)
  ) {
    const keys = [
      ...new Set([...Object.keys(before), ...Object.keys(after)]),
    ].sort((a, b) =>
      Array.isArray(before) ? Number(a) - Number(b) : a.localeCompare(b),
    );
    return keys.flatMap((k) =>
      fieldsDiff(
        (before as Record<string, unknown>)[k],
        (after as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
      ),
    );
  }
  return [
    {
      path,
      before: before ?? null,
      after: after ?? null,
      percent:
        typeof before === "number" && typeof after === "number" && before !== 0
          ? ((after - before) / Math.abs(before)) * 100
          : null,
    },
  ];
}
// Only gameplay fields belong in balance diffs; names, translations and images are metadata.
const gameplay = (c: Card) => ({
  elixir: c.elixir,
  type: c.type,
  rarity: c.rarity,
  arena: c.arena,
  stats: c.stats,
});
export function compareCards(before: Card[], after: Card[]): CardChange[] {
  const a = new Map(before.map((c) => [c.id, c])),
    b = new Map(after.map((c) => [c.id, c]));
  return [...new Set([...a.keys(), ...b.keys()])]
    .sort((x, y) => x - y)
    .flatMap((id) => {
      const x = a.get(id),
        y = b.get(id);
      if (!x || !y)
        return [
          {
            card_id: id,
            kind: !x ? "added" : "removed",
            fields: [],
            name: (y ?? x)!.name,
            image_url: (y ?? x)!.image_url,
          } as CardChange,
        ];
      const fields = fieldsDiff(gameplay(x), gameplay(y));
      return fields.length
        ? [
            {
              card_id: id,
              kind: "modified" as const,
              fields,
              name: y.name,
              image_url: y.image_url,
            },
          ]
        : [];
    });
}
export const sortedSlots = (slots: Slot[]) =>
  [...slots].sort((a, b) => a.id - b.id || a.variant.localeCompare(b.variant));
export const deckIdentity = (region: string, slots: Slot[]) =>
  digest(canonical({ region, slots: sortedSlots(slots) }));
export function copyDeckUrl(slots: Slot[]): string {
  return `https://link.clashroyale.com/deck/en?deck=${slots.map((x) => x.id).join(";")}`;
}
