import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


def atomic_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    temp.replace(path)


def retired_message(endpoint, payload):
    if endpoint == "release":
        return payload.get("stream") not in {"cr-data-community", "supercell-api"} or any(
            card.get("stats") for card in payload.get("cards", [])
        )
    if endpoint == "run":
        return payload.get("source") in {"archive", "feed"}
    if endpoint == "decks":
        return any(deck.get("source") == "royaleapi-presets" for deck in payload.get("decks", []))
    return False


class Publisher:
    """Durable outbox. Save before POST; only remove after an acknowledged success."""

    def __init__(self, root: Path):
        self.root = root / "outbox"
        self.url = os.getenv("ARENA_API_URL", "").rstrip("/")
        self.token = os.getenv("INGEST_TOKEN", "")
        if self.url:
            parsed = urllib.parse.urlparse(self.url)
            if parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise ValueError(
                    "Publishing URL must not contain credentials, query or fragment"
                )
            if parsed.scheme != "https" and not (
                parsed.scheme == "http"
                and parsed.hostname in {"127.0.0.1", "localhost"}
            ):
                raise ValueError("Publishing needs HTTPS or local loopback")
            if not self.token:
                raise ValueError("INGEST_TOKEN is required when publishing")
        # Target-specific queue prevents a successful local delivery hiding an unseeded production target.
        import hashlib

        self.queue = self.root / hashlib.sha256(self.url.encode()).hexdigest()[:16]
        self.queue.mkdir(parents=True, exist_ok=True)

    def submit(self, endpoint, payload):
        if retired_message(endpoint, payload):
            raise ValueError("Parameter/history collection has been retired")
        if not self.url:
            return
        import uuid

        path = self.queue / f"{uuid.uuid4()}.json"
        atomic_json(path, {"endpoint": endpoint, "payload": payload})
        self.deliver(path)

    def deliver(self, path):
        message = json.loads(path.read_text())
        if retired_message(message["endpoint"], message["payload"]):
            # Keep old evidence, but never resend retired jobs restored from an artifact.
            retired = self.queue / "retired"
            retired.mkdir(exist_ok=True)
            path.replace(retired / path.name)
            return
        request = urllib.request.Request(
            self.url + "/api/ingest/" + message["endpoint"],
            data=json.dumps(message["payload"], ensure_ascii=False).encode(),
            headers={
                "Authorization": "Bearer " + self.token,
                "Content-Type": "application/json",
            },
            method="POST",
        )

        # Disable redirects to avoid credential forwarding to a different deployment.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None

        try:
            with urllib.request.build_opener(NoRedirect).open(
                request, timeout=60
            ) as response:
                if response.status != 200:
                    raise RuntimeError("Unexpected publication response")
                json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError(
                f"Publication HTTP {error.code}; retained outbox for retry"
            ) from None
        path.unlink()

    def replay(self):
        if self.url:
            for path in sorted(self.queue.glob("*.json")):
                self.deliver(path)
