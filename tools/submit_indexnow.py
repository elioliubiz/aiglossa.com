#!/usr/bin/env python3
"""Submit production sitemap URLs to IndexNow, grouped by host.

Dry-run is the default. Pass --submit only after the production deployment has
made the key file publicly reachable on every selected host.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
SITES_DIR = ROOT / "sites"
CONTENT = ROOT / "tools" / "content"
KEY_FILE = ROOT / "tools" / "indexnow-key.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"
SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def sitemap_urls(site: str, host: str) -> list[str]:
    root = ET.parse(SITES_DIR / site / "sitemap.xml").getroot()
    urls = [node.text.strip() for node in root.findall("sm:url/sm:loc", SITEMAP_NS) if node.text]
    invalid = [url for url in urls if urlparse(url).hostname != host]
    if invalid:
        raise ValueError(f"{site} sitemap 包含其他 host：{invalid[0]}")
    return urls


def main() -> int:
    sites = json.loads((CONTENT / "sites.json").read_text(encoding="utf-8"))
    parser = argparse.ArgumentParser(description="Submit production URLs to IndexNow")
    parser.add_argument("--site", action="append", choices=sorted(sites), help="仅提交指定站点；可重复")
    parser.add_argument("--submit", action="store_true", help="实际发送；默认仅预览")
    args = parser.parse_args()

    key = KEY_FILE.read_text(encoding="utf-8").strip()
    selected = args.site or list(sites)
    failed = False

    for site in selected:
        host = sites[site]["host"]
        urls = sitemap_urls(site, host)
        key_location = f"https://{host}/{key}.txt"
        print(f"{site}: {len(urls)} URLs | {key_location}")
        if not args.submit:
            continue

        payload = json.dumps({
            "host": host,
            "key": key,
            "keyLocation": key_location,
            "urlList": urls,
        }).encode("utf-8")
        request = urllib.request.Request(
            ENDPOINT,
            data=payload,
            headers={"Content-Type": "application/json; charset=utf-8", "User-Agent": "Aiglossa-IndexNow/1.0"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                print(f"  accepted: HTTP {response.status}")
        except urllib.error.HTTPError as error:
            body = error.read().decode("utf-8", errors="replace").strip()
            print(f"  failed: HTTP {error.code} {body}", file=sys.stderr)
            failed = True
        except urllib.error.URLError as error:
            print(f"  failed: {error.reason}", file=sys.stderr)
            failed = True

    if not args.submit:
        print("dry-run only; pass --submit after production deployment")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
