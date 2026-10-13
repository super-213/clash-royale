export function deckWhere(q: { q: string; card?: number; kind?: string; ids?: string[] }) {
  let from = "decks d";
  const clauses = ["d.hidden=0"];
  const args: (string | number)[] = [];
  if (q.card !== undefined) {
    // CROSS JOIN pins membership as the first lookup. Without it SQLite can
    // prefer deck_seen and scan all visible decks even with a card index.
    from = "deck_cards membership CROSS JOIN decks d ON d.id=membership.deck_id";
    clauses.push("membership.card_id=?");
    args.push(q.card);
  }
  if (q.kind) {
    if (q.card === undefined) {
      from = "(SELECT DISTINCT deck_id FROM deck_origins WHERE kind=?) membership CROSS JOIN decks d ON d.id=membership.deck_id";
    } else {
      clauses.push("d.id IN (SELECT deck_id FROM deck_origins WHERE kind=?)");
    }
    args.push(q.kind);
  }
  if (q.q) {
    clauses.push("EXISTS (SELECT 1 FROM deck_origins o WHERE o.deck_id=d.id AND instr(lower(o.title),lower(?))>0)");
    args.push(q.q);
  }
  if (q.ids !== undefined) {
    const ids = [...new Set(q.ids)];
    clauses.push(ids.length ? `d.id IN (${ids.map(() => "?").join(",")})` : "0");
    args.push(...ids);
  }
  return { from, where: clauses.join(" AND "), args,
    unfiltered: !q.q && q.card === undefined && !q.kind && q.ids === undefined };
}
