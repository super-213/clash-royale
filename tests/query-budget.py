"""SQLite migration/plan regression checked from Vitest with actual generated SQL."""
import json
from pathlib import Path
import sqlite3
import sys

queries = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
for path in sorted(Path('migrations').glob('*.sql'))[:2]:
    db.executescript(path.read_text())
for index in range(1000):
    slots = [{'id': 26000001 + card, 'variant': 'normal'} for card in range(8)]
    if index % 100 == 0:
        slots[0]['id'] = 26000000
    key = f'deck-{index:04d}'
    db.execute('INSERT INTO decks VALUES(?,?,?,?,?,0)', (key, 'global', json.dumps(slots), '2026-01-01', '2026-01-01'))
    db.execute('INSERT INTO deck_origins VALUES(?,?,?,?,?,?)',
               (key, 'test', 'https://example.com', 'target' if index % 100 == 0 else 'other',
                'community' if index % 100 == 0 else 'preset', '2026-01-01'))
# Multiple origins must not duplicate a deck in a filtered result.
db.execute("INSERT INTO deck_origins SELECT deck_id,'second',source_url,title,kind,observed_at FROM deck_origins WHERE deck_id='deck-0000'")
db.executescript(Path('migrations/0003_query_budget.sql').read_text())
assert db.execute('SELECT COUNT(*) FROM deck_cards').fetchone()[0] == 8000

def count():
    materialized = db.execute("SELECT count FROM catalog_totals WHERE name='visible_decks'").fetchone()[0]
    actual = db.execute('SELECT COUNT(*) FROM decks WHERE hidden=0').fetchone()[0]
    assert materialized == actual
    return actual

assert count() == 1000
db.execute("UPDATE decks SET hidden=1 WHERE id='deck-0000'")
assert count() == 999
db.execute("UPDATE decks SET hidden=0 WHERE id='deck-0000'")
db.execute("UPDATE decks SET slots=? WHERE id='deck-0001'", (json.dumps([{'id': 29999999}]),))
assert db.execute("SELECT card_id FROM deck_cards WHERE deck_id='deck-0001'").fetchall() == [(29999999,)]
db.execute("INSERT INTO decks VALUES('new','global',?, '2026','2026',0)", (json.dumps([{'id': 29999999}]),))
assert count() == 1001
db.execute("DELETE FROM decks WHERE id='new'")
assert count() == 1000
assert db.execute("SELECT COUNT(*) FROM deck_cards WHERE deck_id='new'").fetchone()[0] == 0
# Re-observing a deck changes freshness, not the membership index or total.
db.execute("UPDATE decks SET last_seen_at='2027' WHERE id='deck-0000'")
assert count() == 1000
matches, plans = [], []
for query in queries:
    sql = f"SELECT d.id FROM {query['from']} WHERE {query['where']} ORDER BY d.id"
    actual = [r[0] for r in db.execute(sql, query['args'])]
    filt = query['filter']
    expected = []
    for key, slots in db.execute('SELECT id,slots FROM decks WHERE hidden=0'):
        if 'card' in filt and filt['card'] not in [c['id'] for c in json.loads(slots)]: continue
        if 'ids' in filt and key not in filt['ids']: continue
        origins = db.execute('SELECT title,kind FROM deck_origins WHERE deck_id=?', (key,)).fetchall()
        if filt.get('kind') and not any(kind == filt['kind'] for _, kind in origins): continue
        if filt['q'] and not any(filt['q'].lower() in title.lower() for title, _ in origins): continue
        expected.append(key)
    assert actual == sorted(expected), (query, actual, expected)
    matches.append(len(actual))
    plans.append([r[3] for r in db.execute('EXPLAIN QUERY PLAN ' + sql, query['args'])])

def steps(sql, args):
    ticks = [0]
    def progress(): ticks[0] += 1; return 0
    db.set_progress_handler(progress, 1)
    db.execute(sql, args).fetchall()
    db.set_progress_handler(None, 0)
    return ticks[0]

old = "SELECT COUNT(*) FROM decks d WHERE d.hidden=0 AND EXISTS (SELECT 1 FROM json_each(d.slots) s WHERE json_extract(s.value,'$.id')=?)"
first = queries[0]
new = f"SELECT COUNT(*) FROM {first['from']} WHERE {first['where']}"
print(json.dumps({'matches': matches, 'card_plan': plans[0], 'kind_plan': plans[1],
                  'old_vm_steps': steps(old, [26000000]), 'new_vm_steps': steps(new, first['args'])}))
