import json
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class HTTP:
    """Bounded conditional requests. Only configured HTTPS hosts; no redirect escape."""

    def __init__(self, root: Path, extra_hosts=()):
        root.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(root / "http.sqlite")
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS cache(url TEXT PRIMARY KEY,etag TEXT,modified TEXT,body BLOB)"
        )
        self.hosts = {
            "api.github.com",
            "raw.githubusercontent.com",
            "api.clashroyale.com",
            *extra_hosts,
        }
        self.last = {}

    def get(self, url: str, token: str | None = None):
        def validate(target):
            p = urllib.parse.urlparse(target)
            if (
                p.scheme != "https"
                or p.hostname not in self.hosts
                or p.username
                or p.password
            ):
                raise ValueError("Unapproved source URL")

        validate(url)

        class Redirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, target):
                validate(target)
                # Never forward a bearer token to another host.
                if (
                    urllib.parse.urlparse(target).hostname
                    != urllib.parse.urlparse(req.full_url).hostname
                ):
                    raise ValueError("Cross-host redirect rejected")
                return super().redirect_request(req, fp, code, msg, headers, target)

        opener = urllib.request.build_opener(Redirect)
        cached = self.db.execute(
            "SELECT etag,modified,body FROM cache WHERE url=?", (url,)
        ).fetchone()
        headers = {
            "User-Agent": "RoyaleAtlas/0.1 (+https://github.com/RoyaleAPI/cr-api-data)",
            "Accept": "application/json",
        }
        if token:
            headers["Authorization"] = "Bearer " + token
        # Authenticated player responses are never cached on disk.
        if cached and not token:
            if cached[0]:
                headers["If-None-Match"] = cached[0]
            if cached[1]:
                headers["If-Modified-Since"] = cached[1]
        host = urllib.parse.urlparse(url).hostname
        for attempt in range(3):
            time.sleep(max(0, 1.0 - (time.monotonic() - self.last.get(host, 0))))
            self.last[host] = time.monotonic()
            try:
                with opener.open(
                    urllib.request.Request(url, headers=headers), timeout=35
                ) as response:
                    raw = response.read(8_000_001)
                    if len(raw) > 8_000_000:
                        raise ValueError("Source response exceeds 8 MB")
                    result = json.loads(raw)
                    if not token:
                        self.db.execute(
                            "INSERT OR REPLACE INTO cache VALUES(?,?,?,?)",
                            (
                                url,
                                response.headers.get("ETag"),
                                response.headers.get("Last-Modified"),
                                raw,
                            ),
                        )
                        self.db.commit()
                    return result
            except urllib.error.HTTPError as error:
                if error.code == 304 and cached:
                    return json.loads(cached[2])
                if error.code in {401, 403, 404, 429} or error.code < 500:
                    raise RuntimeError(f"Source HTTP {error.code}: {host}") from None
                if attempt == 2:
                    raise RuntimeError(f"Source HTTP {error.code}: {host}") from None
            except (urllib.error.URLError, TimeoutError):
                if attempt == 2:
                    raise RuntimeError(f"Source network failure: {host}") from None
            time.sleep(2**attempt)
        raise RuntimeError("Request failed")
