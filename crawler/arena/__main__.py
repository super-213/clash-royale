import argparse
import json
import os
import sys
import urllib.parse
import uuid
from datetime import datetime, timezone
from pathlib import Path
from .http import HTTP
from .adapters import (
    official_cards,
    official_deck,
    community_snapshot,
)
from .publish import Publisher, atomic_json

ROOT = Path(__file__).resolve().parents[2] / "data"


def now():
    return (
        datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    )


def community(http, publisher):
    repo = "https://api.github.com/repos/jayclim/CR-Data"
    path = "viz-dashboard/src/data/meta_snapshot.json"
    commits = http.get(
        repo + "/commits?path=" + path + "&per_page=1", os.getenv("GITHUB_TOKEN")
    )
    sha = commits[0]["sha"]
    snapshot = http.get(
        "https://raw.githubusercontent.com/jayclim/CR-Data/" + sha + "/" + path
    )
    observed = now()
    url = "https://github.com/jayclim/CR-Data/blob/" + sha + "/" + path
    cards, decks = community_snapshot(snapshot, url, observed)
    timestamp = (
        datetime.fromisoformat(snapshot["timestamp"])
        .astimezone(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )
    release = {
        "stream": "cr-data-community",
        "revision": sha,
        "source_url": url,
        "source_updated_at": timestamp,
        "observed_at": observed,
        "title": "社区样本目录 · " + timestamp[:10],
        "cards": cards,
    }
    atomic_json(ROOT / "community.json", release)
    atomic_json(ROOT / "community-decks.json", {"decks": decks})
    atomic_json(ROOT / "raw" / "community" / sha / "source.json", snapshot)
    publisher.submit("release", release)
    publisher.submit("decks", {"decks": decks})
    print(
        f"community: {len(cards)} observed cards, {len(decks)} pooled-variant deck compositions",
        flush=True,
    )
    return len(cards) + len(decks)


def official(http, publisher):
    token = os.getenv("CLASH_API_TOKEN")
    if not token:
        raise ValueError("CLASH_API_TOKEN is required; configure it in runner secrets")
    observed = now()
    cards = official_cards(
        http.get("https://api.clashroyale.com/v1/cards", token)["items"]
    )
    release = {
        "stream": "supercell-api",
        "revision": observed,
        "source_url": "https://developer.clashroyale.com",
        "source_updated_at": observed,
        "observed_at": observed,
        "title": "官方目录观测 · " + observed[:10],
        "cards": cards,
    }
    atomic_json(ROOT / "official.json", release)
    publisher.submit("release", release)
    decks = []
    for tag in filter(
        None, (x.strip().upper() for x in os.getenv("PLAYER_TAGS", "").split(","))
    ):
        if not tag.startswith("#"):
            tag = "#" + tag
        import re

        if not re.fullmatch(r"#[0289PYLQGRJCUV]+", tag):
            raise ValueError("Invalid player tag")
        profile = http.get(
            "https://api.clashroyale.com/v1/players/"
            + urllib.parse.quote(tag, safe=""),
            token,
        )
        decks.append(official_deck(profile["currentDeck"], tag, observed))
    atomic_json(ROOT / "player-decks.json", {"decks": decks})
    for i in range(0, len(decks), 25):
        publisher.submit("decks", {"decks": decks[i : i + 25]})
    print(f"official: {len(cards)} cards, {len(decks)} player decks", flush=True)
    return len(cards) + len(decks)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        choices=["community", "official"],
        default="community",
    )
    args = parser.parse_args()
    started = now()
    publisher = Publisher(ROOT)
    http = HTTP(ROOT / "cache")
    run = {
        "id": str(uuid.uuid4()),
        "source": args.source,
        "started_at": started,
        "finished_at": started,
        "status": "success",
        "count": 0,
        "message": "",
    }
    try:
        publisher.replay()
        if args.source == "community":
            run["count"] = community(http, publisher)
        else:
            run["count"] = official(http, publisher)
        if args.source == "community":
            run["message"] = (
                "社区采样的卡牌基础资料及卡组组成；形态聚合，不代表热门排名。"
            )
    except Exception as error:
        run["status"] = (
            "blocked"
            if "HTTP 403" in str(error) or "HTTP 429" in str(error)
            else "failed"
        )
        run["message"] = str(error)[:1000]
    run["finished_at"] = now()
    atomic_json(ROOT / "runs" / (run["id"] + ".json"), run)
    try:
        publisher.submit("run", run)
    except Exception as error:
        print(str(error), file=sys.stderr)
        run["status"] = "failed"
    print(json.dumps(run, ensure_ascii=False), flush=True)
    if run["status"] != "success":
        sys.exit(1)


if __name__ == "__main__":
    main()
