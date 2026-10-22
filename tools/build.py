#!/usr/bin/env python3
"""aiglossa.com 站点生成脚本（站点 × 语言 × 页面）。

用法：
    python3 tools/build.py            # 生成 sites/ 下的全部页面，并把资源复制到各站点
    python3 tools/build.py --check     # 只校验（模板占位符、文案齐全、路径冲突），不写文件

为什么要有它：16 种语言 × 多个站点 × 多个页面共享同一套结构，手改必然漏。
这里以 tools/content/*.json 为唯一文案来源，重新生成 sites/ 下的全部页面，diff 一眼能看完。
**部署侧仍是纯静态**：Vercel 直接托管 sites/ 与 vercel.json，不跑这个脚本。

结构约定 —— 目录即 URL：

    sites/<site>/<lang>/<page>   ↔   https://<host>/<lang>/<page>

- `<site>` 是短代号（`root` = 根域，其余为各 App 子域），host 在 content/sites.json 里声明；
- 语言**一律带前缀**（含默认语言 en）：客户端只需拼语言码，不必知道默认语言是谁；
- 协议页放根域（所有 App 共用一套法律文本），支持页放各 App 子域。

新增一个 App：在 content/sites.json 加一条 + 在 vercel.json 加一条 Host 重写 + 一条 DNS 记录。
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "tools" / "content"
TEMPLATES = ROOT / "tools" / "templates"
SITES_DIR = ROOT / "sites"
ASSETS = ROOT / "assets"

# 占位符统一用 {{key}}：模板是纯文件，渲染器只知道这一种语法，
# 于是"模板里有占位符、文案里没有对应字段"会在构建时报错，而不是静默留下 {{...}}。
PLACEHOLDER = re.compile(r"\{\{([a-zA-Z0-9_]+)\}\}")

# 协议页：模板在 templates/protocol/<name>.html，输出 <lang>/protocol/<name>.html。
PROTOCOL_PAGES = ("privacy", "term", "delete-account")

# 非协议页的注册表：页面名 -> (模板文件, 文案来源键, 输出相对语言目录的路径)
# 输出路径为 "" 表示 <lang>/index.html（即该语言的站点首页）。
PAGES = {
    "brand": ("brand.html", "brand", ""),
    "marketing": ("marketing.html", "marketing", ""),
    "support": ("support.html", "support", "support.html"),
    # 工具站：英文优先的产品，因此该站点在 sites.json 里用 "langs": ["en"] 收窄语言集合。
    "tools": ("tools.html", "tools", ""),
}


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def _capitalize(text: str) -> str:
    """首字母大写。对阿拉伯文、泰文等无大小写的文字是空操作，因此可无条件调用。"""
    return text[:1].upper() + text[1:] if text else text


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


def render_tools(items: list[dict], site_base: str) -> str:
    """工具列表卡片。live 的给链接，coming soon 的不可点。"""
    out = []
    for item in items:
        name = esc(item["name"])
        desc = esc(item["desc"])
        meta = esc(item.get("meta", ""))
        status = esc(item.get("status", ""))
        href = item.get("href") or ""
        live = status.lower().startswith("live")
        cls = "live" if live else "soon"
        badge = f'<span class="badge {cls}">{status}</span>' if status else ""
        body = (
            f'      <div class="tool-top"><span class="tool-name">{name}</span>{badge}</div>\n'
            f'      <p class="tool-desc">{desc}</p>\n'
            f'      <p class="tool-meta">{meta}</p>\n'
        )
        if href:
            # 用 {{prefix}} 而不是生产的绝对地址：本地预览时绝对地址会指到线上（点开 404）
            out.append(
                f'    <a class="tool" href="{{{{prefix}}}}{href.lstrip("/")}">\n{body}'
                f'      <span class="tool-go">Open →</span>\n    </a>'
            )
        else:
            out.append(f'    <div class="tool soon">\n{body}      <span class="tool-go">Coming soon</span>\n    </div>')
    return "\n".join(out)


def render_pricing(tiers: list[dict]) -> str:
    out = []
    for tier in tiers:
        out.append(
            '        <div class="tier">\n'
            f'          <div class="name">{esc(tier["name"])}</div>\n'
            f'          <div class="amount">{esc(tier["price"])}</div>\n'
            f'          <div class="unit">{esc(tier["unit"])}</div>\n'
            "        </div>"
        )
    return "\n".join(out)


def card_language_code(label: str, name_to_code: dict[str, str]) -> str | None:
    """从卡片标题（如 "Français · page 12"）取出书名语言代码，用于校验。"""
    head = label.split("·")[0].strip()
    return name_to_code.get(head)


def render(template: str, values: dict[str, str], where: str) -> str:
    """把 {{key}} 换成 values[key]；任何找不到对应值的占位符都直接报错。"""
    missing: list[str] = []

    def sub(match: re.Match) -> str:
        key = match.group(1)
        if key not in values:
            missing.append(key)
            return match.group(0)
        return values[key]

    out = PLACEHOLDER.sub(sub, template)
    if missing:
        raise AssertionError(f"{where}: 模板占位符没有对应文案：{sorted(set(missing))}")
    return out


def url_for(site_base: str, lang: str, page_path: str) -> str:
    """该页面的对外 URL（index.html 用目录形式，带结尾斜杠）。"""
    return f"{site_base}/{lang}/" + (page_path if page_path else "")


def rel_link(depth: int, lang: str, page_path: str) -> str:
    """同一页面在另一语言下的**相对**链接。

    刻意用相对路径：本地双击 HTML 也能正常切换与加载样式（绝对路径在 file:// 下无意义）。
    部署后路径同样正确。
    """
    return "../" * depth + lang + "/" + page_path


def alternates_for(site_base: str, languages: dict, default: str, page_path: str, order: list[str]) -> str:
    """该页面的 hreflang 集合：只列真有这一页的语言，x-default 指默认语言。"""
    lines = [
        f'<link rel="alternate" hreflang="{languages[c]["hreflang"]}" href="{url_for(site_base, c, page_path)}">'
        for c in order
    ]
    lines.append(
        f'<link rel="alternate" hreflang="x-default" href="{url_for(site_base, default, page_path)}">'
    )
    return "\n".join(lines)


def switcher_details(depth: int, current: str, page_path: str, languages: dict, order: list[str]) -> str:
    """营销页页脚的语言切换器（details + 链接，无 JS）。"""
    items = "\n".join(
        '        <li><a href="{href}" data-lang="{code}"{cur}>{name}</a></li>'.format(
            href=rel_link(depth, code, page_path),
            code=code,
            cur=' aria-current="true"' if code == current else "",
            name=esc(languages[code]["name"]),
        )
        for code in order
    )
    return items


def switcher_select(depth: int, current: str, page_path: str, languages: dict, order: list[str]) -> str:
    """协议页的语言切换器（沿用原页面的 select 外观与 CSS）。

    只带一句"选了就跳转"的内联脚本：无 JS 时页面本身仍是正确语言（分文件后不再依赖 JS 渲染），
    这是相对旧实现（必须靠 JS 把文案换过来）的关键差别。
    """
    options = "\n".join(
        '                <option value="{href}"{sel}>{name}</option>'.format(
            href=rel_link(depth, code, page_path),
            sel=" selected" if code == current else "",
            name=esc(languages[code]["name"]),
        )
        for code in order
    )
    return (
        '            <div class="lang-switch">\n'
        '                <select onchange="if(this.value)location.href=this.value">\n'
        f"{options}\n"
        "                </select>\n"
        "            </div>"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="只校验，不写文件")
    args = parser.parse_args()

    languages_cfg = json.loads((CONTENT / "languages.json").read_text(encoding="utf-8"))
    languages = languages_cfg["languages"]
    default = languages_cfg["default"]
    sites = json.loads((CONTENT / "sites.json").read_text(encoding="utf-8"))

    order = list(languages)
    if default not in languages:
        print(f"✗ default={default!r} 不在 languages 里", file=sys.stderr)
        return 1

    # 法律页所在站（协议页放根域，所有 App 共用）：sites.json 里标记 legal=true 的那个。
    legal_sites = [key for key, spec in sites.items() if spec.get("legal")]
    if len(legal_sites) != 1:
        print(f"✗ 必须且只能有一个站点标记 legal=true，当前 {legal_sites}", file=sys.stderr)
        return 1
    legal_base = f'https://{sites[legal_sites[0]]["host"]}'.rstrip("/")

    marketing = json.loads((CONTENT / "marketing.json").read_text(encoding="utf-8"))
    name_to_code = {spec["name"]: code for code, spec in languages.items()}

    problems: list[str] = []
    for code, locale in marketing.items():
        for key in ("cardA", "cardB"):
            book = card_language_code(locale[key]["label"], name_to_code)
            if book is None:
                problems.append(f"marketing.{code}.{key}: 卡片标题里的语言名无法识别（{locale[key]['label']!r}）")
            elif book == code:
                problems.append(f"marketing.{code}.{key}: 示例书语言与站点语言相同（{locale[key]['label']!r}）")
    if problems:
        for problem in problems:
            print(f"✗ {problem}", file=sys.stderr)
        return 1

    written: list[str] = []
    seen_targets: set[Path] = set()

    def emit(site: str, lang: str, depth: int, page_path: str, template_name: str,
             values_builder, site_langs: list[str]) -> None:
        site_base = f'https://{sites[site]["host"]}'.rstrip("/")
        # 站点可以收窄语言集合（sites.json 的 "langs"）：没有它时就是全部语言。
        # x-default 必须指向该站点的默认语言，而默认语言不一定等于全局默认（en）。
        site_default = default if default in site_langs else site_langs[0]
        where = f"{site}.{lang}.{page_path or 'index'}"
        template_path = TEMPLATES / template_name
        values = {
            "lang": languages[lang]["hreflang"],
            "dir": languages[lang]["dir"],
            "default": site_default,
            "og_locale": languages[lang]["ogLocale"],
            "prefix": "../" * depth,
            "site_base": site_base,
            "canonical": url_for(site_base, lang, page_path),
            "alternates": alternates_for(site_base, languages, site_default, page_path, site_langs),
            "switcher": switcher_details(depth, lang, page_path, languages, site_langs),
        }
        values.update(values_builder(lang, site_base))
        # builder 生成的 HTML 片段里可能含 {{prefix}}（如工具卡链接）：
        # render() 只做一遍替换，插入的文本不会被重新扫描，所以这里再处理一次。
        for key in ("tools", "cta_href"):
            if key in values:
                values[key] = values[key].replace("{{prefix}}", values["prefix"])
        page = render(template_path.read_text(encoding="utf-8"), values, where)
        target = SITES_DIR / site / lang / (page_path or "index.html")
        if target in seen_targets:
            raise AssertionError(f"重复的输出路径：{target}")
        seen_targets.add(target)
        if not args.check:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(page, encoding="utf-8")
        written.append(f'{where:34s} -> {target.relative_to(ROOT)}')

    for site, spec in sites.items():
        # 站点语言集合：默认全部语言；声明了 "langs" 就只用声明的那些。
        site_langs = spec.get("langs", order)
        unknown = [c for c in site_langs if c not in languages]
        if unknown:
            print(f"✗ {site}: langs 里有未定义的语言 {unknown}", file=sys.stderr)
            return 1
        for page in spec["pages"]:
            if page == "protocol":
                protocol = json.loads((CONTENT / "protocol.json").read_text(encoding="utf-8"))
                for name in PROTOCOL_PAGES:
                    copy = protocol[name]
                    missing = [c for c in site_langs if c not in copy]
                    if missing:
                        print(f"✗ protocol.{name} 缺语言：{missing}", file=sys.stderr)
                        return 1
                    for lang in site_langs:
                        emit(site, lang, 2, f"protocol/{name}.html", f"protocol/{name}.html",
                             lambda lang, base, copy=copy, name=name: {
                                 # 正文按原样插入（旧实现用 innerHTML，文案里本来就带 &copy; 之类的实体）；
                                 # 只有进 <title> 的 page_title 需要转义。
                                 **copy[lang],
                                 "page_title": esc(copy[lang]["page_title"]),
                                 "switcher": switcher_select(2, lang, f"protocol/{name}.html", languages, site_langs),
                             }, site_langs)
                continue

            if page not in PAGES:
                print(f"✗ 未登记的页面：{page}", file=sys.stderr)
                return 1
            template_name, source_key, page_path = PAGES[page]
            if not (TEMPLATES / template_name).exists():
                print(f"✗ 缺模板：tools/templates/{template_name}", file=sys.stderr)
                return 1
            source_path = CONTENT / f"{source_key}.json"
            if not source_path.exists():
                print(f"✗ 缺文案源：tools/content/{source_key}.json", file=sys.stderr)
                return 1
            source = json.loads(source_path.read_text(encoding="utf-8"))
            missing = [c for c in site_langs if c not in source]
            if missing:
                print(f"✗ {source_key} 缺语言：{missing}", file=sys.stderr)
                return 1

            depth = page_path.count("/") + 1
            if page == "brand":
                # 品牌页（根域首页）：自我介绍 + 应用列表。
                # 目前只列 Scholan 一个应用，且**域名取自 sites.json**（不硬编码）；
                # 将来加第二个 App 时，在模板里复制一个 .app 块并加一组 {{app2_*}} 文案即可。
                def brand_values(lang: str, base: str, source=source) -> dict[str, str]:
                    locale = source[lang]
                    # Scholan 的一句话简介直接取自营销文案的 <title>（形如 "Scholan — …"），
                    # 不重复翻译同一句话。
                    marketing_title = marketing[lang]["title"]
                    assert "—" in marketing_title, f"marketing.{lang}.title 缺少分隔符：{marketing_title!r}"
                    scholan_base = f'https://{sites["scholan"]["host"]}'.rstrip("/")
                    return {
                        "title": esc(locale["title"]),
                        "h1": esc(locale["h1"]),
                        "lede": esc(locale["lede"]),
                        "apps_title": esc(locale["apps_title"]),
                        "about_text": esc(locale["about_text"]),
                        "scholan_meta": esc(locale["scholan_meta"]),
                        "learn_more": esc(locale["learn_more"]),
                        "support_label": esc(locale["support_label"]),
                        "scholan_desc": esc(_capitalize(marketing_title.split("—", 1)[1].strip())),
                        "scholan_href": f"{scholan_base}/{lang}/",
                        "scholan_support_href": f"{scholan_base}/{lang}/support.html",
                        "legal_privacy": esc(marketing[lang]["legal"]["privacy"]),
                        "legal_terms": esc(marketing[lang]["legal"]["terms"]),
                        "legal_privacy_href": f"{legal_base}/{lang}/protocol/privacy.html",
                        "legal_terms_href": f"{legal_base}/{lang}/protocol/term.html",
                        "lang_label": esc(marketing[lang]["langLabel"]),
                        "current_name": esc(languages[lang]["name"]),
                    }
                values_builder = brand_values
            elif page == "marketing":
                def marketing_values(lang: str, base: str, source=source) -> dict[str, str]:
                    locale = source[lang]
                    return {
                        "title": esc(locale["title"]),
                        "description": esc(locale["description"]),
                        "h1": "<br>".join(esc(line) for line in locale["h1"]),
                        "lede": esc(locale["lede"]),
                        "card_a": render_card(locale["cardA"]),
                        "card_b": render_card(locale["cardB"]),
                        "langs": esc(locale["langs"]),
                        "steps": render_steps(locale["steps"]),
                        "closing": esc(locale["closing"]),
                        "lang_label": esc(locale["langLabel"]),
                        "current_name": esc(languages[lang]["name"]),
                        "brand": esc("Scholan · " + sites[site]["host"]),
                        "legal_privacy": esc(locale["legal"]["privacy"]),
                        "legal_terms": esc(locale["legal"]["terms"]),
                        "legal_privacy_href": f"{legal_base}/{lang}/protocol/privacy.html",
                        "legal_terms_href": f"{legal_base}/{lang}/protocol/term.html",
                    }
                values_builder = marketing_values
            elif page == "tools":
                def tools_values(lang: str, base: str, source=source) -> dict[str, str]:
                    # 工具站：法务标签/语言名复用 marketing.json 与 languages.json 的既有译文，
                    # 只有产品文案（标题、步骤、价格）是这里独有的，不重复翻译同一句话。
                    locale = source[lang]
                    return {
                        "title": esc(locale["title"]),
                        "description": esc(locale["description"]),
                        "h1": esc(locale["h1"]),
                        "lede": esc(locale["lede"]),
                        "tools": render_tools(locale["tools"], base),
                        "note": esc(locale["note"]),
                        "cta_label": esc(locale["cta_label"]),
                        "cta_href": "{{prefix}}" + locale["cta_href"].lstrip("/"),
                        "lang_label": esc(marketing[lang]["langLabel"]),
                        "current_name": esc(languages[lang]["name"]),
                        "brand": esc("aiglossa · " + sites[site]["host"]),
                        "legal_privacy": esc(marketing[lang]["legal"]["privacy"]),
                        "legal_terms": esc(marketing[lang]["legal"]["terms"]),
                        "legal_privacy_href": f"{legal_base}/{lang}/protocol/privacy.html",
                        "legal_terms_href": f"{legal_base}/{lang}/protocol/term.html",
                    }
                values_builder = tools_values
            else:
                protocol = json.loads((CONTENT / "protocol.json").read_text(encoding="utf-8"))

                def support_values(lang: str, base: str, source=source) -> dict[str, str]:
                    # 支持页：正文按原样插入（contact_text 里有 mailto 链接、footer 里有 &copy;），
                    # 只有标题转义。法务标签与页脚**复用**协议页/营销页已有的译文，不重复翻译。
                    locale = source[lang]
                    return {
                        **locale,
                        "title": esc(locale["title"]),
                        "legal_privacy": esc(marketing[lang]["legal"]["privacy"]),
                        "legal_terms": esc(marketing[lang]["legal"]["terms"]),
                        "legal_delete_label": esc(protocol["delete-account"][lang]["page_title"]),
                        "legal_privacy_href": f"{legal_base}/{lang}/protocol/privacy.html",
                        "legal_terms_href": f"{legal_base}/{lang}/protocol/term.html",
                        "legal_delete_href": f"{legal_base}/{lang}/protocol/delete-account.html",
                        "footer": protocol["privacy"][lang]["footer"],
                        "switcher": switcher_select(depth, lang, page_path, languages, order),
                    }

                values_builder = support_values

            for lang in site_langs:
                emit(site, lang, depth, page_path, template_name, values_builder, site_langs)

        if not args.check and ASSETS.is_dir():
            target_assets = SITES_DIR / site / "assets"
            if target_assets.exists():
                shutil.rmtree(target_assets)
            shutil.copytree(ASSETS, target_assets)
            written.append(f'{site:34s} -> sites/{site}/assets/（资源副本）')

    print(("校验通过（未写文件）" if args.check else "已生成页面") + "：")
    for line in written:
        print("  " + line)
    print(f"\n共 {len(sites)} 个站点，各站语言集合见上（全局默认 {default}）。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
