"""Restore the latest source-specific durable outbox artifact. HTTP cache is only an optimization."""

import io
import json
import os
import urllib.request
import zipfile
from pathlib import Path

repo = os.environ["GITHUB_REPOSITORY"]
source = os.environ["CRAWL_SOURCE"]
token = os.environ["GITHUB_TOKEN"]
base = "https://api.github.com/repos/" + repo


def get(url):
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
        },
    )

    # GitHub artifact download redirects to signed storage URLs. Do not forward API token.
    class Redirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, url):
            new = super().redirect_request(req, fp, code, msg, headers, url)
            if new:
                new.remove_header("Authorization")
            return new

    with urllib.request.build_opener(Redirect).open(request, timeout=45) as response:
        data = response.read(120_000_001)
        if len(data) > 120_000_000:
            raise RuntimeError("Artifact exceeds restoration budget")
        return data


artifacts = []
# Bounded 5 pages covers > 80 days with two daily public-source artifacts; fail rather than
# silently guessing if this becomes insufficient for a configured source.
for page in range(1, 6):
    batch = json.loads(get(base + f"/actions/artifacts?per_page=100&page={page}"))[
        "artifacts"
    ]
    artifacts.extend(
        x
        for x in batch
        if x["name"].startswith("crawl-state-" + source + "-") and not x["expired"]
    )
    if artifacts or len(batch) < 100:
        break
if not artifacts and len(batch) == 100 and page == 5:
    raise RuntimeError("Artifact lookup budget exhausted; review retained source state")
if not artifacts:
    print(
        "No retained outbox artifact; source will be fetched again and D1 deduplicates deliveries."
    )
else:
    latest = max(artifacts, key=lambda x: x["created_at"])
    archive = zipfile.ZipFile(
        io.BytesIO(get(base + "/actions/artifacts/" + str(latest["id"]) + "/zip"))
    )
    # Upload artifact's least common ancestor is data/. Only restore outbox, not source code.
    for item in archive.infolist():
        relative = Path(item.filename)
        if relative.is_absolute() or ".." in relative.parts:
            raise RuntimeError("Unsafe artifact path")
        if not relative.parts or relative.parts[0] != "outbox" or item.is_dir():
            continue
        if item.file_size > 6_100_000:
            raise RuntimeError("Outbox entry exceeds budget")
        target = Path("data") / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.read(item))
    print("Restored source outbox artifact", latest["id"])
