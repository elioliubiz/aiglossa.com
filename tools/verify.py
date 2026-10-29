#!/usr/bin/env python3
"""站点产物校验（只读，不写文件）。

用法：python3 tools/verify.py

与 `build.py --check` 互补：那边校验**源数据与模板**（文案齐不齐、占位符对不对得上），
这边校验**生成结果是否自洽**：

1. `sites/<site>/<lang>/<page>` 与 content/sites.json + 页面登记表完全对应（不多不少）；
2. 每个页面的 hreflang 自洽：16 种语言 + x-default，且都指向**本站点的同一页**；
3. canonical 用本站点 host；页面里没有残留 `{{占位符}}`，也没有旧实现的 `?lang=` 链接；
4. 协议页只出现在声明了 protocol 的站点（法律文本所有 App 共用一份，不复制到各子域）；
5. vercel.json 里每个站点都有 Host 重写与根路径 301。

改模板、加语言、加站点后各跑一次。退出码非 0 表示有问题。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "tools" / "content"
SITES_DIR = ROOT / "sites"
PROTOCOL_PAGES = ("privacy", "term", "delete-account")
# 页面登记（与 build.py 的 PAGES 对应）：页面名 -> [(产物文件, URL 路径)]。
# 两者刻意分开：营销页的 URL 是 `<lang>/`，产物文件却是 `<lang>/index.html`。
PAGES: dict[str, list[tuple[str, str]]] = {
    "brand": [("index.html", "")],
    "marketing": [("index.html", "")],
    "support": [("support.html", "support.html")],
    "tools": [("index.html", "")],
}


def outputs_for(page: str) -> list[tuple[str, str]]:
    if page == "guides":
        guides = json.loads((CONTENT / "guides.json").read_text(encoding="utf-8"))
        slugs = set()
        for loc in guides.values():
            slugs.update(loc.keys())
        return ([("guides/index.html", "guides/")] +
                [(f"guides/{slug}.html", f"guides/{slug}.html") for slug in sorted(slugs)])
    if page == "music":
        return [("music/index.html", "music/")]
    if page == "music-share":
        return [("music/share/index.html", "music/share/")]
    if page in ("refund", "acceptable-use"):
        return [(f"{page}.html", f"{page}.html")]
    if page == "webpricing":
        return [("pricing.html", "pricing.html")]
    if page in ("login", "webaccount"):
        return [("account.html" if page == "webaccount" else "login.html", "account.html" if page == "webaccount" else "login.html")]
        return [("login.html", "login.html")]
    if page in ("pricing", "account"):
        return [(f"{page}.html", f"{page}.html")]
    if page == "protocol":
        return [(f"protocol/{name}.html", f"protocol/{name}.html") for name in PROTOCOL_PAGES]
    return PAGES[page]


def site_codes_for_tools(sites: dict) -> list[str]:
    spec = sites.get("tools", {})
    return spec.get("langs", list(json.loads((CONTENT / "languages.json").read_text(encoding="utf-8"))["languages"]))


def main() -> int:
    languages = json.loads((CONTENT / "languages.json").read_text(encoding="utf-8"))
    codes = list(languages["languages"])
    default = languages["default"]
    sites = json.loads((CONTENT / "sites.json").read_text(encoding="utf-8"))
    vercel = json.loads((ROOT / "vercel.json").read_text(encoding="utf-8"))

    problems: list[str] = []

    # 1) 产物与声明一一对应
    expected: set[Path] = set()
    declared_extras: list[Path] = []
    for site, spec in sites.items():
        site_codes = spec.get("langs", codes)
        for page in spec["pages"]:
            # guides 只对 guides.json 里实际有译文的语言期待产物
            if page == "guides":
                gj = json.loads((CONTENT / "guides.json").read_text(encoding="utf-8"))
                for code, articles in gj.items():
                    if code not in site_codes:
                        continue
                    expected.add(SITES_DIR / site / code / "guides" / "index.html")
                    for slug in articles:
                        expected.add(SITES_DIR / site / code / "guides" / f"{slug}.html")
                continue
            page_langs = site_codes
            for lang in page_langs:
                for file_rel, _ in outputs_for(page):
                    expected.add(SITES_DIR / site / lang / file_rel)
        # 手写产物（不按语言分目录、不来自模板）：例如通用链接的回落页，以及
        # `.well-known/apple-app-site-association`。它们同样必须在 sites.json 里声明，
        # 否则"产物必须被声明"这条检查就形同虚设。
        for file_rel in spec.get("extra", []):
            declared_extras.append(SITES_DIR / site / file_rel)
    # .html 的手写产物参与"多余/缺失"全量比对；其余（无扩展名的 AASA 等）只查存在，
    # 因为它们不在 `rglob("*.html")` 的范围里，混进同一个集合会误报"缺失"。
    expected.update(path for path in declared_extras if path.suffix == ".html")
    actual = set(SITES_DIR.rglob("*.html"))
    for path in sorted(expected - actual):
        problems.append(f"声明了但产物缺失：{path.relative_to(ROOT)}")
    for path in sorted(actual - expected):
        problems.append(f"产物多余（sites.json 未声明）：{path.relative_to(ROOT)}")
    for path in declared_extras:
        if not path.exists():
            problems.append(f"声明的手写产物缺失：{path.relative_to(ROOT)}")

    # 指南：每篇的语言集合不同，单独校验（存在性 + hreflang 覆盖）
    gj = json.loads((CONTENT / "guides.json").read_text(encoding="utf-8"))
    for code, articles in gj.items():
        if code not in site_codes_for_tools(sites):
            continue
        for slug in articles:
            have = [c for c in gj if slug in gj[c]]
            f = SITES_DIR / "tools" / code / "guides" / f"{slug}.html"
            if not f.exists():
                problems.append(f"指南缺少产物：{f.relative_to(ROOT)}")
                continue
            text = f.read_text(encoding="utf-8")
            got = sorted(re.findall(r'<link rel="alternate" hreflang="([^"]+)"', text))
            want = sorted([languages["languages"][c]["hreflang"] for c in have] + ["x-default"])
            if got != want:
                problems.append(f"{code}/guides/{slug}.html: hreflang 不符（应为 {want}）")

    # 2/3) 逐页检查 hreflang / canonical / 占位符 / 旧链接
    for site, spec in sites.items():
        base = f'https://{spec["host"]}'
        site_codes = spec.get("langs", codes)
        site_default = default if default in site_codes else site_codes[0]
        for page in spec["pages"]:
            # guides 目前只有英文：期待集合与产物范围都收窄到 en
            if page == "guides":
                continue      # 指南逐篇语言集合不同，用下面的专用校验
            page_codes = site_codes
            want_hreflang = sorted([languages["languages"][c]["hreflang"] for c in page_codes] + ["x-default"])
            for file_rel, url_rel in outputs_for(page):
                for lang in page_codes:
                    f = SITES_DIR / site / lang / file_rel
                    if not f.exists():
                        continue
                    text = f.read_text(encoding="utf-8")
                    where = f"{site}/{lang}/{file_rel}"

                    if "{{" in text:
                        problems.append(f"{where}: 残留未替换的占位符")
                    if "?lang=" in text:
                        problems.append(f"{where}: 残留旧实现的 ?lang= 链接")

                    html_tag = re.search(r'<html lang="([^"]+)" dir="([^"]+)"', text)
                    if not html_tag:
                        problems.append(f"{where}: 缺 <html lang/dir>")
                    else:
                        if html_tag.group(1) != languages["languages"][lang]["hreflang"]:
                            problems.append(f"{where}: html lang={html_tag.group(1)}，应为 {languages['languages'][lang]['hreflang']}")
                        if html_tag.group(2) != languages["languages"][lang]["dir"]:
                            problems.append(f"{where}: html dir={html_tag.group(2)}，应为 {languages['languages'][lang]['dir']}")

                    alternates = re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"', text)
                    got = sorted(code for code, _ in alternates)
                    if got != want_hreflang:
                        problems.append(f"{where}: hreflang 集合不符（缺 {set(want_hreflang) - set(got)}，多 {set(got) - set(want_hreflang)}）")
                    for code, href in alternates:
                        # x-default 不是语言码，按规定指向**该站点的默认语言**的同一页。
                        target_lang = site_default if code == "x-default" else code
                        want = f"{base}/{target_lang}/{url_rel}" if url_rel else f"{base}/{target_lang}/"
                        if href != want:
                            problems.append(f"{where}: hreflang {code} 指向 {href}，应为 {want}")

                    canonical = re.search(r'<link rel="canonical" href="([^"]+)"', text)
                    want_canonical = f"{base}/{lang}/{url_rel}" if url_rel else f"{base}/{lang}/"
                    if not canonical or canonical.group(1) != want_canonical:
                        problems.append(f"{where}: canonical 为 {canonical.group(1) if canonical else '缺失'}，应为 {want_canonical}")

    # 4) 协议页只在声明了它的站点
    for site, spec in sites.items():
        if "protocol" in spec["pages"]:
            continue
        for lang in spec.get("langs", codes):
            if (SITES_DIR / site / lang / "protocol").exists():
                problems.append(f"{site}: 未声明 protocol，但产物里有协议页")

    # 5) vercel.json 覆盖每个站点
    rewrites = json.dumps(vercel.get("rewrites", []), ensure_ascii=False)
    redirects = json.dumps(vercel.get("redirects", []), ensure_ascii=False)
    for site, spec in sites.items():
        if spec["host"] not in rewrites:
            problems.append(f"vercel.json 缺 {spec['host']} 的 Host 重写")
        if spec["host"] not in redirects:
            problems.append(f"vercel.json 缺 {spec['host']} 的根路径 301")

    if problems:
        for problem in problems:
            print("✗ " + problem, file=sys.stderr)
        print(f"\n共 {len(problems)} 个问题", file=sys.stderr)
        return 1

    print("✓ 校验通过")
    print("  站点 × 页面：" + "、".join(f"{k}[{'/'.join(v['pages'])}]" for k, v in sites.items()))
    print(f"  语言 {len(codes)} 种（默认 {default}，根路径 301 到 /{default}/）")
    print(f"  产物 HTML {len(actual)} 个：hreflang 集合、canonical、vercel.json 均自洽")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
