import re


def preset_decks(rows, cards, source_url, observed_at):
    by_key = {c["key"]: c for c in cards}
    result, skipped = [], 0
    for row in rows:
        keys = row.get("spells", [])
        if len(keys) != 8 or len(set(keys)) != 8 or any(k not in by_key for k in keys):
            skipped += 1
            continue
        result.append(
            {
                "region": "global",
                "slots": [{"id": by_key[k]["id"], "variant": "normal"} for k in keys],
                "source": "royaleapi-presets",
                "source_url": source_url,
                "title": row["name"],
                "kind": "preset",
                "observed_at": observed_at,
            }
        )
    if not result:
        raise ValueError("Preset parser produced zero valid decks")
    return result, skipped


def official_cards(rows):
    if not rows:
        raise ValueError("Official API returned no cards")
    result = []
    for c in rows:
        # API has metadata, not hitpoints/damage. Do not carry old archive stats into this stream.
        key = (
            re.sub(r"[^a-z0-9]+", "-", c["name"].lower()).strip("-")
            + "-"
            + str(c["id"])
        )
        card_type = {26: "Troop", 27: "Building", 28: "Spell"}.get(
            c["id"] // 1000000, "Other"
        )
        result.append(
            {
                "id": c["id"],
                "key": key,
                "name": c["name"],
                "name_en": c["name"],
                "description": "",
                "type": card_type,
                "rarity": c.get("rarity", "unknown").title(),
                "elixir": c["elixirCost"],
                "arena": None,
                "image_url": c.get("iconUrls", {}).get("medium"),
                "stats": {},
            }
        )
    return result


def official_deck(cards, tag, observed_at):
    if len(cards) != 8 or len({c["id"] for c in cards}) != 8:
        raise ValueError("Official currentDeck is not an eight-card deck")
    return {
        "region": "global",
        "slots": [
            {
                "id": c["id"],
                "variant": "evolution" if c.get("evolutionLevel", 0) > 0 else "normal",
            }
            for c in cards
        ],
        "source": "supercell-players",
        "source_url": "https://api.clashroyale.com/v1/players/"
        + tag.replace("#", "%23"),
        "title": "玩家 " + tag + " 的当前卡组",
        "kind": "player",
        "observed_at": observed_at,
    }


def community_snapshot(snapshot, source_url, observed_at):
    if snapshot.get("schema_version") != 2:
        raise ValueError("Community schema changed")
    rows = snapshot.get("cards", [])
    if len(rows) < 100:
        raise ValueError("Community sample coverage unexpectedly low")
    cards = []
    for c in rows:
        cards.append(
            {
                "id": c["id"],
                "key": c["key"],
                "name": c["name"],
                "name_en": c["name"],
                "description": "",
                "type": {26: "Troop", 27: "Building", 28: "Spell"}.get(
                    c["id"] // 1000000, "Other"
                ),
                "rarity": c["rarity"].title(),
                "elixir": c["elixir"],
                "arena": None,
                "image_url": c.get("icon"),
                "stats": {},
            }
        )
    ids = {c["id"] for c in cards}
    decks = []
    for row in snapshot.get("top_decks", []):
        slots = row.get("cards", [])
        if (
            len(slots) != 8
            or len({c["id"] for c in slots}) != 8
            or any(c["id"] not in ids for c in slots)
        ):
            raise ValueError("Invalid community deck")
        # The source explicitly pools variants; representative is_evo/is_hero icons cannot
        # establish an exact variant configuration for the aggregated deck.
        decks.append(
            {
                "region": "global",
                "slots": [{"id": c["id"], "variant": "unknown"} for c in slots],
                "source": "cr-data-community",
                "source_url": source_url,
                "title": "社区样本 · " + " / ".join(c["name"] for c in slots[:2]),
                "kind": "community",
                "observed_at": observed_at,
            }
        )
    if not decks:
        raise ValueError("Community source returned no decks")
    return cards, decks
