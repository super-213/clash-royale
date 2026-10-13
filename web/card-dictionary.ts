import type { Card } from "../shared/schema";
import { api } from "./api";

// A release is immutable. Share in-flight loads (including StrictMode remounts)
// and retain a bounded set of dictionaries when switching between sources.
export function createDictionaryLoader(
  request: (url: string) => Promise<{ cards: Card[] }> = api,
) {
  const entries = new Map<string, Promise<Record<number, Card>>>();
  return (stream: string, release: string) => {
    const key = `${stream}:${release}`;
    const existing = entries.get(key);
    if (existing) return existing;
    const params = new URLSearchParams({ stream, release });
    const pending = request(`/api/cards/dictionary?${params}`)
      .then(({ cards }) => Object.fromEntries(cards.map((card) => [card.id, card])))
      .catch((error) => {
        if (entries.get(key) === pending) entries.delete(key);
        throw error;
      });
    entries.set(key, pending);
    if (entries.size > 4) entries.delete(entries.keys().next().value!);
    return pending;
  };
}

export const loadCardDictionary = createDictionaryLoader();
