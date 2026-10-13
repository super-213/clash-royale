import json
from pathlib import Path
import pytest
from arena.adapters import (
    gameplay_components,
    preset_decks,
    official_cards,
    official_deck,
    community_snapshot,
)
from arena.publish import Publisher, atomic_json


def test_nested_components_and_no_cosmetic_changes():
    raw = {
        "troop": [
            {
                "name": "Wizard",
                "summon_character": "Wizard",
                "mana_cost": 5,
                "icon_file": "wizard",
            }
        ],
        "characters": [
            {"name": "Wizard", "projectile": "Bolt", "hitpoints": 100, "mesh": "new"}
        ],
        "projectile": [{"name": "Bolt", "damage": 20, "damage_per_level": [20, 22]}],
    }
    stats = gameplay_components({"sc_key": "Wizard"}, raw)
    assert stats["projectile/Bolt"]["damage"] == 20
    assert "mesh" not in stats["characters/Wizard"]
    assert "icon_file" not in stats["troop/Wizard"]


def test_cycles_do_not_duplicate_components():
    raw = {
        "characters": [
            {"name": "A", "spawn_character": "B"},
            {"name": "B", "spawn_character": "A"},
        ]
    }
    assert len(gameplay_components({"sc_key": "A"}, raw)) == 2


def test_incomplete_unknown_and_duplicate_presets_are_excluded():
    cards = [{"key": str(i), "id": 26000000 + i} for i in range(8)]
    rows = [
        {"name": "OK", "spells": [str(i) for i in range(8)]},
        {"name": "incomplete", "spells": ["0"]},
        {"name": "duplicate", "spells": ["0"] * 8},
        {"name": "unknown", "spells": [str(i) for i in range(1, 9)]},
    ]
    decks, skipped = preset_decks(
        rows, cards, "https://example.com", "2026-01-01T00:00:00Z"
    )
    assert len(decks) == 1 and skipped == 3


def test_api_does_not_invent_combat_stats():
    cards = official_cards(
        [{"id": 26000000, "name": "Knight", "rarity": "common", "elixirCost": 3}]
    )
    assert cards[0]["stats"] == {}
    assert cards[0]["image_url"] is None


def test_player_variant_preserved():
    cards = [
        {"id": 26000000 + i, "evolutionLevel": 1 if i == 0 else 0} for i in range(8)
    ]
    assert (
        official_deck(cards, "#ABC", "2026-01-01T00:00:00Z")["slots"][0]["variant"]
        == "evolution"
    )


def test_failed_publication_leaves_replayable_outbox(tmp_path, monkeypatch):
    monkeypatch.setenv("ARENA_API_URL", "http://127.0.0.1:1")
    monkeypatch.setenv("INGEST_TOKEN", "test")
    publisher = Publisher(tmp_path)
    monkeypatch.setattr(
        publisher,
        "deliver",
        lambda path: (_ for _ in ()).throw(RuntimeError("offline")),
    )
    with pytest.raises(RuntimeError):
        publisher.submit("decks", {"decks": []})
    files = list(publisher.queue.glob("*.json"))
    assert len(files) == 1 and json.loads(files[0].read_text())["endpoint"] == "decks"


def test_queue_is_per_target(tmp_path, monkeypatch):
    monkeypatch.setenv("INGEST_TOKEN", "test")
    monkeypatch.setenv("ARENA_API_URL", "http://127.0.0.1:8787")
    a = Publisher(tmp_path)
    monkeypatch.setenv("ARENA_API_URL", "https://atlas.example.com")
    b = Publisher(tmp_path)
    assert a.queue != b.queue


def test_pooled_community_variants_are_not_inferred_from_representative_icons():
    rows = [
        {
            "id": 26000000 + i,
            "key": "card-" + str(i),
            "name": "Card " + str(i),
            "elixir": 3,
            "rarity": "common",
            "icon": None,
        }
        for i in range(100)
    ]
    snapshot = {
        "schema_version": 2,
        "cards": rows,
        "top_decks": [
            {"cards": [{**c, "is_evo": True, "is_hero": True} for c in rows[:8]]}
        ],
    }
    cards, decks = community_snapshot(
        snapshot, "https://example.com", "2026-01-01T00:00:00Z"
    )
    assert len(cards) == 100
    assert all(s["variant"] == "unknown" for s in decks[0]["slots"])
    assert cards[0]["arena"] is None and cards[0]["stats"] == {}
