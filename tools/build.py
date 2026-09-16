#!/usr/bin/env python3
"""Scholan 官网生成脚本。

用法：
    python3 tools/build.py            # 生成 tools/strings.json 里已有的所有语言
    python3 tools/build.py --check     # 只做校验，不写文件

为什么要有它：16 个语言页面共享同一套结构，改一次版式手改 16 个文件必然漏；
这里以 strings.json 为唯一文案来源，重新生成全部页面，diff 一眼能看完。
**部署侧仍是纯静态**：Vercel 直接托管生成出来的 HTML，不跑这个脚本。

生成位置（与 strings.json 的 _languages[*].path 一致）：
    en      -> index.html
    其它    -> <code>/index.html
"""

from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STRINGS = ROOT / "tools" / "strings.json"

TEMPLATE = """<!DOCTYPE html>
<html lang="{lang}" dir="{dir}" data-default-lang="{default}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{url}">
{alternates}
<meta property="og:type" content="website">
<meta property="og:site_name" content="Scholan">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{url}">
<meta property="og:locale" content="{og_locale}">
<meta property="og:image" content="{base}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Scholan">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{base}/assets/og.png">
<meta name="theme-color" content="#0b0d12">
<link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="{prefix}assets/apple-touch-icon.png">
<link rel="stylesheet" href="{prefix}assets/site.css">
</head>
<body>
<main>
  <section class="hero">
    <div class="wrap center">
      <p class="kicker">SCHOLAN</p>
      <h1>{h1}</h1>
      <p class="lede">{lede}</p>
      <aside class="cards">
{card_a}
{card_b}
      </aside>
      <p class="langs">{langs}</p>
    </div>
  </section>

  <div class="band">
    <div class="wrap">
      <div class="steps">
{steps}
      </div>
      <p class="closing">{closing}</p>
    </div>
  </div>
</main>

<footer>
  <div class="wrap foot">
    <span class="brand">Scholan · aiglossa.com</span>
    <nav class="legal">
      <a href="{prefix}protocol/privacy.html?lang={code}">{legal_privacy}</a>
      <a href="{prefix}protocol/term.html?lang={code}">{legal_terms}</a>
    </nav>
    <details class="switcher">
      <summary>{lang_label} · {current_name}</summary>
      <ul>
{switcher}
      </ul>
    </details>
  </div>
</footer>

<script src="{prefix}assets/site.js" defer></script>
</body>
</html>
"""


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def render_card(card: dict) -> str:
    rows = []
    # dir="auto"：原词可能是阿拉伯文等 RTL 文字，交给浏览器按内容判定方向，
    # 否则在 LTR 页面里会出现标点跑到词前面的问题。
    for row in card["rows"]:
        rows.append(
            '          <div class="row">\n'
            f'            <div class="w"><b dir="auto">{esc(row["w"])}</b>'
            f'<span class="badge">{int(row["l"])}</span></div>\n'
            f'            <div class="d" dir="auto">{esc(row["m"])}</div>\n'
            "          </div>"
        )
    body = "\n".join(rows)
    return (
        '        <div class="card">\n'
        f'          <div class="head"><b dir="auto">{esc(card["label"])}</b>'
        f'<span>{esc(card["pages"])}</span></div>\n'
        f"{body}\n"
        "        </div>"
    )


def render_steps(steps: list[dict]) -> str:
    out = []
    for step in steps:
        out.append(
            "        <div>\n"
            f'          <span class="n">{esc(step["n"])}</span>\n'
            f'          <h3>{esc(step["h"])}</h3>\n'
            f'          <p>{esc(step["p"])}</p>\n'
            "        </div>"
        )
    return "\n".join(out)


def rel_prefix(from_code: str, languages: dict) -> str:
    """页面到站点根目录的相对前缀。

    刻意用相对路径而不是 /assets/...：这样本地双击 index.html 也能正常加载样式与脚本
    （绝对路径在 file:// 下会指向文件系统根，样式全丢）。部署后路径同样正确。
    """
    return "" if languages[from_code]["path"] == "/" else "../"


def link_to(from_code: str, to_code: str, languages: dict) -> str:
    target = languages[to_code]["path"].lstrip("/")
    return (rel_prefix(from_code, languages) + target) or "./"


def card_language_code(label: str, name_to_code: dict[str, str]) -> str | None:
    """从卡片标题（如 "Français · page 12"）取出书名语言代码，用于校验。"""
    head = label.split("·")[0].strip()
    return name_to_code.get(head)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="只校验，不写文件")
    args = parser.parse_args()

    data = json.loads(STRINGS.read_text(encoding="utf-8"))
    meta = data["_meta"]
    languages = data["_languages"]
    locales = data["locales"]
    default = meta["default"]
    base = meta["baseUrl"].rstrip("/")

    unknown = [code for code in locales if code not in languages]
    if unknown:
        print(f"✗ 未在 _languages 里登记的语言：{unknown}", file=sys.stderr)
        return 1

    name_to_code = {spec["name"]: code for code, spec in languages.items()}

    # 校验：示例书的语言不能等于当前站点语言（否则等于在说"用法语读法语书"）。
    problems: list[str] = []
    for code, locale in locales.items():
        for key in ("cardA", "cardB"):
            book = card_language_code(locale[key]["label"], name_to_code)
            if book is None:
                problems.append(f"{code}.{key}: 卡片标题里的语言名无法识别（{locale[key]['label']!r}）")
            elif book == code:
                problems.append(f"{code}.{key}: 示例书语言与站点语言相同（{locale[key]['label']!r}）")
    if problems:
        for problem in problems:
            print(f"✗ {problem}", file=sys.stderr)
        return 1

    order = [code for code in languages if code in locales]

    # hreflang：只列已经生成的语言，x-default 指向默认语言页。
    alternates = "\n".join(
        f'<link rel="alternate" hreflang="{languages[code]["hreflang"]}" href="{base}{languages[code]["path"]}">'
        for code in order
    )
    alternates += f'\n<link rel="alternate" hreflang="x-default" href="{base}{languages[default]["path"]}">'

    written: list[str] = []
    for code in order:
        locale = locales[code]
        spec = languages[code]

        switcher = "\n".join(
            '        <li><a href="{href}" data-lang="{code}"{current}>{name}</a></li>'.format(
                href=link_to(code, other, languages),
                code=other,
                current=' aria-current="true"' if other == code else "",
                name=esc(languages[other]["name"]),
            )
            for other in order
        )

        page = TEMPLATE.format(
            lang=spec["hreflang"],
            code=code,
            dir=spec["dir"],
            prefix=rel_prefix(code, languages),
            default=default,
            title=esc(locale["title"]),
            description=esc(locale["description"]),
            url=f'{base}{spec["path"]}',
            base=base,
            alternates=alternates,
            og_locale=spec["ogLocale"],
            h1="<br>".join(esc(line) for line in locale["h1"]),
            lede=esc(locale["lede"]),
            card_a=render_card(locale["cardA"]),
            card_b=render_card(locale["cardB"]),
            langs=esc(locale["langs"]),
            steps=render_steps(locale["steps"]),
            closing=esc(locale["closing"]),
            lang_label=esc(locale["langLabel"]),
            current_name=esc(spec["name"]),
            legal_privacy=esc(locale["legal"]["privacy"]),
            legal_terms=esc(locale["legal"]["terms"]),
            switcher=switcher,
        )

        target = ROOT / "index.html" if spec["path"] == "/" else ROOT / spec["path"].strip("/") / "index.html"
        if not args.check:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(page, encoding="utf-8")
        written.append(f'{code:8s} -> {target.relative_to(ROOT)}')

    missing = [code for code in languages if code not in locales]

    print(("校验通过（未写文件）" if args.check else "已生成页面") + "：")
    for line in written:
        print("  " + line)
    print(f"\n共 {len(order)}/{len(languages)} 种语言。未完成：{'、'.join(missing) if missing else '无'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
