import { describe, expect, it } from "vitest";
import { matchDeck, summarizeDeck } from "../shared/brief";
import type { BalanceEdition } from "../shared/brief";
import type { Deck, Slot } from "../shared/schema";
import { balanceEditions } from "../worker/balance-feed";
import community from "../data/community.json";

const edition = balanceEditions[0];
const slot = (id: number, variant: Slot["variant"] = "normal"): Slot => ({
  id,
  variant,
});

describe("personal balance brief", () => {
  it("uses stable official IDs, even with no selected card dictionary", () => {
    expect(
      matchDeck([slot(28000015)], edition).map((m) => m.entry.name),
    ).toEqual(["野蛮人滚桶"]);
    expect(matchDeck([slot(26000000)], edition)).toEqual([]);
  });
  it("never applies evolution or hero-only changes to an ordinary card", () => {
    expect(matchDeck([slot(27000000), slot(26000023)], edition)).toEqual([]);
    const matches = matchDeck(
      [slot(27000000, "evolution"), slot(26000023, "hero")],
      edition,
    );
    expect(matches.map((m) => m.certainty)).toEqual(["direct", "direct"]);
  });
  it("marks unknown forms as conditional rather than direct", () => {
    const matches = matchDeck(
      [slot(27000000, "unknown"), slot(28000015, "unknown")],
      edition,
    );
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.certainty === "variant_unknown")).toBe(true);
  });
  it("does not silently assume base changes are inherited by special forms", () => {
    expect(matchDeck([slot(28000004, "evolution")], edition)[0].certainty).toBe(
      "inheritance_unknown",
    );
  });
  it("groups simultaneous changes without losing mixed directions or unit semantics", () => {
    const hound = matchDeck([slot(26000029)], edition)[0].entry;
    expect(hound.facts).toHaveLength(2);
    expect(hound.facts[1]).toMatchObject({
      metric: "hit_rate",
      unit: "hits_per_second",
      before: 0.77,
      after: 0.67,
    });
    const ghost = matchDeck([slot(26000050)], edition)[0].entry;
    expect(ghost.category).toBe("nerf");
    expect(ghost.facts.map((f) => f.sourcePercent)).toEqual(["-5%", "+1%"]);
    const drill = matchDeck([slot(27000013)], edition)[0].entry;
    expect(drill.facts[0]).toMatchObject({
      before: 0,
      after: 20,
      sourcePercent: null,
    });
  });
  it("counts affected cards once across multiple metrics and matching forms", () => {
    const deck = {
      id: "test",
      slots: [slot(26000029), slot(27000000, "unknown")],
    } as Deck;
    const report = summarizeDeck(deck, edition);
    expect(report.directCards).toBe(1);
    expect(report.possibleCards).toBe(1);
    const synthetic: BalanceEdition = {
      ...edition,
      entries: [
        edition.entries[0],
        { ...edition.entries[0], key: "test-evolution", variant: "evolution" },
      ],
    };
    expect(
      summarizeDeck({ ...deck, slots: [slot(28000015, "unknown")] }, synthetic)
        .possibleCards,
    ).toBe(1);
  });
  it("preserves the source coverage and unverified release state", () => {
    expect(edition.entries).toHaveLength(17);
    expect(edition.entries.flatMap((e) => e.facts)).toHaveLength(21);
    expect(edition.liveVersionVerified).toBe(false);
    expect(edition.effectiveAt).toBeNull();
    expect(
      edition.entries.flatMap((e) => e.facts).every((f) => f.level === null),
    ).toBe(true);
    for (const entry of edition.entries) {
      const identity = community.cards.find((c) => c.id === entry.cardId);
      expect(identity?.key).toBe(entry.key.replace(/-ev\d+$|-hero$/, ""));
      expect(entry.interpretation.length).toBeGreaterThan(10);
      expect(entry.watch.length).toBeGreaterThan(10);
    }
  });
});
