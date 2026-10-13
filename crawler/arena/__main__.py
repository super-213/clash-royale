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
    archive_cards,
    preset_decks,
    official_cards,
    official_deck,
    community_snapshot,
)
from .publish import Publisher, atomic_json

ROOT = Path(__file__).resolve().parents[2] / "data"
REPO = "https://api.github.com/repos/RoyaleAPI/cr-api-data"
RAW = "https://raw.githubusercontent.com/RoyaleAPI/cr-api-data"


def now():
    return (
        datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    )


def archive(http, publisher, history):
    commits = http.get(
        REPO + "/commits?path=docs/json/cards_stats.json&per_page=" + str(history),
        os.getenv("GITHUB_TOKEN"),
    )
    if not isinstance(commits, list) or not commits:
        raise ValueError("No source revisions")
    count = 0
    for commit in reversed(commits):
        sha, date = commit["sha"], commit["commit"]["committer"]["date"]
        base = RAW + "/" + sha + "/docs/json/"
        inputs = {
            name: http.get(base + name + ".json")
            for name in ["cards", "cards_i18n", "cards_stats", "predefined_decks"]
        }
        cards = archive_cards(
            inputs["cards"], inputs["cards_i18n"], inputs["cards_stats"]
        )
        observed = now()
        release = {
            "stream": "royaleapi-archive",
            "revision": sha,
            "source_url": "https://github.com/RoyaleAPI/cr-api-data/tree/" + sha,
            "source_updated_at": date,
            "observed_at": observed,
            "title": "历史参数 · " + date[:10],
            "cards": cards,
        }
        atomic_json(ROOT / "raw" / sha / "source.json", inputs)
        atomic_json(ROOT / "releases" / (sha + ".json"), release)
        publisher.submit("release", release)
        if commit == commits[0]:
            decks, skipped = preset_decks(
                inputs["predefined_decks"],
                cards,
                "https://github.com/RoyaleAPI/cr-api-data/blob/"
                + sha
                + "/docs/json/predefined_decks.json",
                observed,
            )
            atomic_json(
                ROOT / "decks.json", {"decks": decks, "skipped_presets": skipped}
            )
            for i in range(0, len(decks), 25):
                publisher.submit("decks", {"decks": decks[i : i + 25]})
            count = len(cards) + len(decks)
        print(
            f"archive {sha[:8]}: {len(cards)} cards; source updated {date}", flush=True
        )
    return count


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


def feed(http, publisher):
    url = os.getenv("STATS_FEED_URL")
    if not url:
        raise ValueError("STATS_FEED_URL is required")
    release = http.get(url)
    if release.get("stream") in {
        "supercell-api",
        "royaleapi-archive",
        "cr-data-community",
    }:
        raise ValueError("A custom feed needs its own stream")
    release["observed_at"] = now()
    if not release.get("cards"):
        raise ValueError("Empty normalized feed")
    atomic_json(ROOT / "feed.json", release)
    publisher.submit("release", release)
    return len(release["cards"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        choices=["archive", "community", "official", "feed"],
        default="archive",
    )
    parser.add_argument(
        "--history",
        type=int,
        default=1,
        help="Archive revisions, oldest first; 1 for routine sync",
    )
    args = parser.parse_args()
    if not 1 <= args.history <= 30:
        parser.error("--history must be 1..30")
    started = now()
    publisher = Publisher(ROOT)
    extra = (
        [urllib.parse.urlparse(os.getenv("STATS_FEED_URL", "")).hostname]
        if os.getenv("STATS_FEED_URL")
        else []
    )
    http = HTTP(ROOT / "cache", extra)
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
        if args.source == "archive":
            run["count"] = archive(http, publisher, args.history)
        elif args.source == "community":
            run["count"] = community(http, publisher)
        elif args.source == "official":
            run["count"] = official(http, publisher)
        else:
            run["count"] = feed(http, publisher)
        if args.source == "archive":
            run["message"] = "历史归档来源；更新停留于 2023 年，不能代表当前平衡参数。"
        if args.source == "community":
            run["message"] = (
                "社区采样的卡牌目录及卡组组成；形态聚合，非全量卡牌或完整战斗参数。"
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
