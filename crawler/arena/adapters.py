import re
from collections import deque

COSMETIC_PREFIXES = (
    "icon_",
    "highres_",
    "prestige_",
    "shader_",
    "tid_",
    "indicator_",
    "visual_",
    "health_bar",
    "flame_effect",
    "target_effect",
    "mesh",
)
COSMETIC_FIELDS = {
    "name",
    "name_en",
    "key",
    "sc_key",
    "description",
    "id",
    "elixir",
    "type",
    "rarity",
    "arena",
    "_lang",
    "scale",
    "tribe",
    "flags",
}


def gameplay_field(key):
    # Preserve unknown source mechanics instead of discarding fields just because the UI
    # has no translated label. Exclude explicit identity/localization/visual/audio fields.
    return (
        key not in COSMETIC_FIELDS
        and not key.startswith(COSMETIC_PREFIXES)
        and not any(
            x in key
            for x in (
                "_effect",
                "_animation",
                "_sound",
                "_export",
                "_swf",
                "_filter_file",
            )
        )
    )


REFERENCE_GROUPS = {
    "summon_character": "characters",
    "summon_character_second": "characters",
    "spawn_character": "characters",
    "spawn_character2": "characters",
    "spawn_character3": "characters",
    "death_spawn_character": "characters",
    "death_spawn_character2": "characters",
    "death_spawn_character3": "characters",
    "morph_character": "characters",
    "projectile": "projectile",
    "custom_first_projectile": "projectile",
    "projectile_special": "projectile",
    "area_effect_object": "spell",
    "death_spell": "spell",
    "buff": "character_buff",
    "buff_type": "character_buff",
    "starting_buff": "character_buff",
    "buff_on_damage": "character_buff",
    "chained_buff": "character_buff",
    "spawn_projectile": "projectile",
    "death_spawn_projectile": "projectile",
    "area_effect_on_hit": "spell",
    "area_effect_on_dash": "spell",
    "area_effect_on_morph": "spell",
    "evolved_spells": "troop",
}


def gameplay_components(card, raw):
    indexes = {group: {r["name"]: r for r in records} for group, records in raw.items()}
    queue = deque()
    for group in ("troop", "building", "spell", "characters"):
        if card["sc_key"] in indexes.get(group, {}):
            queue.append((group, card["sc_key"]))
        evolved = card.get("evolved_spells_sc_key")
        if evolved and evolved in indexes.get(group, {}):
            queue.append((group, evolved))
    result = {}
    while queue:
        group, name = queue.popleft()
        path = group + "/" + name
        if path in result:
            continue
        row = indexes.get(group, {}).get(name)
        if row is None:
            continue
        result[path] = {k: v for k, v in row.items() if gameplay_field(k)}
        for field, target in REFERENCE_GROUPS.items():
            if row.get(field):
                queue.append((target, row[field]))
    return result


def archive_cards(cards, translations, stats):
    names = {c["id"]: c.get("_lang", {}) for c in translations}
    result = []
    for c in cards:
        lang = names.get(c["id"], {})
        result.append(
            {
                "id": c["id"],
                "key": c["key"],
                "name": lang.get("name", {}).get("cn") or c["name"],
                "name_en": c["name"],
                "description": lang.get("description", {}).get("cn")
                or c.get("description", ""),
                "type": c["type"],
                "rarity": c["rarity"],
                "elixir": c["elixir"],
                "arena": c["arena"],
                "image_url": f"https://raw.githubusercontent.com/RoyaleAPI/cr-api-assets/master/cards/{c['key']}.png",
                "stats": gameplay_components(c, stats),
            }
        )
    if len(result) < 100:
        raise ValueError("Archive coverage dropped below 100 cards")
    if len({c["id"] for c in result}) != len(result):
        raise ValueError("Duplicate card identity")
    return result


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
