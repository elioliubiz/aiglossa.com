#!/usr/bin/env python3
"""官网生成结果的结构自检。

用法：python3 tools/verify.py

build.py 保证的是"内容与示例书语言规则"，这个脚本保证的是"每个语言页的结构完整"：
语言/方向属性、hreflang 互指、语言切换器条数、法律页链接带上本页语言参数、
以及没有残留的模板占位符。加语言或改模板后跑一次即可。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STRINGS = ROOT / "tools" / "strings.json"


def page_path(spec: dict) -> Path:
    if spec["path"] == "/":
        return ROOT / "index.html"
    return ROOT / spec["path"].strip("/") / "index.html"


def main() -> int:
    data = json.loads(STRINGS.read_text(encoding="utf-8"))
    languages: dict = data["_languages"]
    locales: dict = data["locales"]
    built = [code for code in languages if code in locales]

    problems: list[str] = []
    rows: list[tuple[str, str, int, int, str]] = []

    for code in built:
        spec = languages[code]
        path = page_path(spec)
        if not path.exists():
            problems.append(f"{code}: 页面不存在（{path.relative_to(ROOT)}），先跑 tools/build.py")
            continue

        page = path.read_text(encoding="utf-8")
        head = re.search(r'<html lang="([^"]+)" dir="([^"]+)"', page)
        alternates = len(re.findall(r'rel="alternate"', page))
        switcher = len(re.findall(r"<li><a href=", page))
        legal = sorted(set(re.findall(r"protocol/[a-z-]+\.html\?lang=([A-Za-z-]+)", page)))
        leftovers = sorted(set(re.findall(r"\{[a-z_]+\}", page)))

        if not head:
            problems.append(f"{code}: <html lang/dir> 缺失")
        else:
            if head.group(1) != spec["hreflang"]:
                problems.append(f"{code}: html lang={head.group(1)}，应为 {spec['hreflang']}")
            if head.group(2) != spec["dir"]:
                problems.append(f"{code}: dir={head.group(2)}，应为 {spec['dir']}")
        if alternates != len(built) + 1:
            problems.append(f"{code}: hreflang {alternates} 条，应为 {len(built)} + x-default")
        if switcher != len(built):
            problems.append(f"{code}: 语言切换器 {switcher} 项，应为 {len(built)}")
        if legal != [code]:
            problems.append(f"{code}: 法律页参数 {legal}，应为本页语言 {code}")
        if leftovers:
            problems.append(f"{code}: 模板占位符未替换 {leftovers}")

        rows.append((code, f"{head.group(1)}/{head.group(2)}" if head else "?", alternates, switcher, ",".join(legal)))

    print(f'  {"code":9s} {"lang/dir":16s} {"hreflang":9s} {"切换器":7s} {"法律页参数"}')
    for code, langdir, alternates, switcher, legal in rows:
        print(f"  {code:9s} {langdir:16s} {alternates:<9} {switcher:<7} {legal}")

    if problems:
        print("\n✗ 发现问题：", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        return 1

    missing = [code for code in languages if code not in locales]
    print(f"\n✓ {len(built)}/{len(languages)} 种语言结构自检通过。未完成：{'、'.join(missing) if missing else '无'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
