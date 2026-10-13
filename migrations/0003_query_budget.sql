-- Build the card membership index once for existing decks. Slots remain the
-- canonical representation; triggers keep the derived index transactional.
CREATE TABLE deck_cards (
 card_id INTEGER NOT NULL,
 deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
 PRIMARY KEY(card_id, deck_id)
) WITHOUT ROWID;
CREATE INDEX deck_cards_deck ON deck_cards(deck_id);
INSERT INTO deck_cards(card_id,deck_id)
 SELECT DISTINCT CAST(json_extract(s.value,'$.id') AS INTEGER),d.id
 FROM decks d,json_each(d.slots) s;
CREATE INDEX deck_origin_kind ON deck_origins(kind,deck_id);

CREATE TRIGGER deck_cards_insert AFTER INSERT ON decks BEGIN
 INSERT INTO deck_cards(card_id,deck_id)
 SELECT DISTINCT CAST(json_extract(value,'$.id') AS INTEGER),NEW.id FROM json_each(NEW.slots);
END;
CREATE TRIGGER deck_cards_update AFTER UPDATE OF slots ON decks
 WHEN NEW.slots<>OLD.slots BEGIN
 DELETE FROM deck_cards WHERE deck_id=NEW.id;
 INSERT INTO deck_cards(card_id,deck_id)
 SELECT DISTINCT CAST(json_extract(value,'$.id') AS INTEGER),NEW.id FROM json_each(NEW.slots);
END;

-- Avoid COUNT(*) over every visible deck for status and the unfiltered list.
CREATE TABLE catalog_totals (name TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count>=0));
INSERT INTO catalog_totals SELECT 'visible_decks',COUNT(*) FROM decks WHERE hidden=0;
CREATE TRIGGER deck_total_insert AFTER INSERT ON decks WHEN NEW.hidden=0 BEGIN
 UPDATE catalog_totals SET count=count+1 WHERE name='visible_decks';
END;
CREATE TRIGGER deck_total_delete AFTER DELETE ON decks WHEN OLD.hidden=0 BEGIN
 UPDATE catalog_totals SET count=count-1 WHERE name='visible_decks';
END;
CREATE TRIGGER deck_total_hidden AFTER UPDATE OF hidden ON decks WHEN NEW.hidden<>OLD.hidden BEGIN
 UPDATE catalog_totals SET count=count+(NEW.hidden=0)-(OLD.hidden=0) WHERE name='visible_decks';
END;
