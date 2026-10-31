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

# food 只使用自己的少量资源，避免把 scholan 截图等整套 assets 复制过去。
FOOD_ASSETS = (
    "food.css", "food.js", "wallet.js", "favicon-food.svg", "apple-touch-icon-food.png", "og.png",
    "food-icon-192.png", "food-icon-512.png", "food-icon-maskable-512.png", "food-sample.jpg",
)

FOOD_ASSET_VERSION = "20261031-7"

# 占位符统一用 {{key}}：模板是纯文件，渲染器只知道这一种语法，
# 于是"模板里有占位符、文案里没有对应字段"会在构建时报错，而不是静默留下 {{...}}。
PLACEHOLDER = re.compile(r"\{\{([a-zA-Z0-9_]+)\}\}")


def missing_translation_paths(common: dict, localized: dict, prefix: str = "") -> list[str]:
    """Return visible common-copy leaves that a localized image page still inherits in English."""
    missing: list[str] = []
    for key, value in common.items():
        if not prefix and key == "examples":
            continue  # Language-neutral records; their visible names live in example_names.
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            child = localized.get(key, {})
            if not isinstance(child, dict):
                missing.append(path)
            else:
                missing.extend(missing_translation_paths(value, child, path))
        elif key not in localized:
            missing.append(path)
    return missing

# 协议页：模板在 templates/protocol/<name>.html，输出 <lang>/protocol/<name>.html。
PROTOCOL_PAGES = ("privacy", "term", "delete-account")

# 非协议页的注册表：页面名 -> (模板文件, 文案来源键, 输出相对语言目录的路径)
# 输出路径为 "" 表示 <lang>/index.html（即该语言的站点首页）。
PAGES = {
    "brand": ("brand.html", "brand", ""),
    # 平台登录页（主站）：/ {lang}/login.html
    "login": ("pages/login.html", "ui", "login.html"),
    "webaccount": ("pages/account.html", "ui", "account.html"),
    "webpricing": ("pages/pricing-root.html", "ui", "pricing.html"),
    "marketing": ("marketing.html", "marketing", ""),
    "support": ("support.html", "support", "support.html"),
    "tools": ("tools.html", "tools", ""),
    # 法律页：正文整体从 ui.json 取（与 protocol 页同样的做法），页面数固定
    "refund": ("pages/legal.html", "ui", "refund.html"),
    "acceptable-use": ("pages/legal.html", "ui", "acceptable-use.html"),
    "music": ("pages/make.html", "ui", "music/index.html"),
    "music-share": ("pages/share.html", "ui", "music/share/index.html"),
    "image": ("pages/image.html", "image", "image/index.html"),
    "image-share": ("pages/image-share.html", "image", "image/share/index.html"),
    "food": ("pages/food.html", "food", "food/index.html"),
    # 指南（内容页）：英文优先，生成到 /en/guides/<slug>.html
    "guides": ("pages/guide.html", "guides", "guides/{slug}.html"),
    # 每个工具一个目录（/{lang}/music/、未来 /{lang}/image/），全局页仍在语言根
}


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def _capitalize(text: str) -> str:
    """首字母大写。对阿拉伯文、泰文等无大小写的文字是空操作，因此可无条件调用。"""
    return text[:1].upper() + text[1:] if text else text


# staging 环境：把页面里写死的生产主站链接改写到当前环境。
# 只影响以 https://aiglossa.com 开头的链接，生产环境执行时是空操作。
ENV_LINK_FIX = """
<script>
(function () {
  var h = location.hostname;
  if (h.indexOf("staging.aiglossa.com") < 0) return;
  var main = "https://staging.aiglossa.com";
  document.querySelectorAll('a[href^="https://aiglossa.com"]').forEach(function (a) {
    a.href = main + a.getAttribute("href").slice("https://aiglossa.com".length);
  });
})();
</script>
</body>"""


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
                f'    <a class="tool" href="{href.lstrip("/")}">\n{body}'
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
    """该页面的对外 URL（index.html 用目录形式，带结尾斜杠）。

    工具页现在是目录（music/index.html → /music/），所以尾部 index.html 要抹掉。
    """
    if page_path.endswith("index.html"):
        page_path = page_path[: -len("index.html")]
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


def _site_urls(site: str, spec: dict) -> list[str]:
    """该站点所有可索引页面的路径（不含语言前缀），用于生成 sitemap。"""
    guides = {}
    gpath = CONTENT / "guides.json"
    if gpath.exists():
        guides = json.loads(gpath.read_text(encoding="utf-8"))

    urls: list[str] = []
    for page in spec["pages"]:
        if page in ("brand", "marketing", "tools"):
            urls.append(("", None))
        elif page == "protocol":
            for name in PROTOCOL_PAGES:
                urls.append((f"protocol/{name}.html", None))
        elif page == "guides":
            langs_with_guides = [c for c in guides]
            urls.append(("guides/", langs_with_guides))
            slugs = sorted({slug for loc in guides.values() for slug in loc})
            for slug in slugs:
                urls.append((f"guides/{slug}.html", [c for c in langs_with_guides if slug in guides[c]]))
        elif page == "music":
            urls.append(("music/", None))
        elif page == "image":
            urls.append(("image/", None))
        elif page == "food":
            urls.append(("food/", None))
        elif page in ("account", "webaccount", "refund", "login", "music-share", "image-share"):
            continue          # noindex / 内部页面，不进 sitemap
        elif page == "webpricing":
            urls.append(("pricing.html", None))   # 输出文件名与页面键不同
        else:
            urls.append((f"{page}.html", None))
    return urls


def _write_food_pwa(site: str, site_langs: list[str], languages: dict) -> None:
    """Write per-language manifest + service worker for the food PWA.

    The service worker sits in /<lang>/food/, so its default scope is exactly the
    language directory. Only the shell is cached; API calls always go to network.
    """
    source = json.loads((CONTENT / "food.json").read_text(encoding="utf-8"))
    icons = [
        {"src": f"../../assets/food-icon-192.png?v={FOOD_ASSET_VERSION}", "sizes": "192x192", "type": "image/png"},
        {"src": f"../../assets/food-icon-512.png?v={FOOD_ASSET_VERSION}", "sizes": "512x512", "type": "image/png"},
        {"src": f"../../assets/food-icon-maskable-512.png?v={FOOD_ASSET_VERSION}", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ]
    for lang in site_langs:
        copy = source[lang]
        folder = SITES_DIR / site / lang / "food"
        folder.mkdir(parents=True, exist_ok=True)
        manifest = {
            "name": copy["title"],
            "short_name": "AIGLOSSA FOOD",
            "description": copy["description"],
            "lang": languages[lang]["hreflang"],
            "dir": languages[lang]["dir"],
            "start_url": "./",
            "scope": "./",
            "display": "standalone",
            "background_color": "#FBFAF7",
            "theme_color": "#FBFAF7",
            "icons": icons,
        }
        (folder / "manifest.webmanifest").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        sw = f"""/* aiglossa food service worker — network-first; cache is only an offline fallback. */
const CACHE = "aiglossa-food-{lang}-v11";
const V = "{FOOD_ASSET_VERSION}";
const SHELL = ["./", "../../assets/food.css?v=" + V, "../../assets/food.js?v=" + V, "../../assets/wallet.js?v=" + V, "../../assets/food-icon-192.png?v=" + V, "../../assets/food-icon-512.png?v=" + V, "../../assets/food-sample.jpg?v=" + V];
self.addEventListener("install", (event) => {{
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
}});
self.addEventListener("activate", (event) => {{
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
}});
self.addEventListener("fetch", (event) => {{
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).then((response) => {{
      if (response.ok) {{
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }}
      return response;
    }}).catch(() => caches.match(request).then((cached) => cached || (request.mode === "navigate" ? caches.match("./") : undefined)))
  );
}});
"""
        (folder / "sw.js").write_text(sw, encoding="utf-8")


def _write_seo_files(site: str, spec: dict, site_langs: list[str],
                     languages: dict, default: str) -> None:
    """为站点生成 robots.txt 与 sitemap.xml。

    每条 URL 带 hreflang 互链（xhtml:link），与页面头部的 {{alternates}} 保持一致，
    Google 从任意一处即可发现全部语言版本。
    """
    base = f'https://{spec["host"]}'.rstrip("/")
    targets = SITES_DIR / site
    xdef = default if default in site_langs else site_langs[0]
    paths = _site_urls(site, spec)

    (targets / "robots.txt").write_text(
        "User-agent: *\nAllow: /\n\nSitemap: " + base + "/sitemap.xml\n",
        encoding="utf-8",
    )

    # lastmod 帮助搜索引擎判断"内容变了，值得重抓"
    from datetime import datetime, timezone
    lastmod = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
           '        xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for path, own_langs in paths:
        langs = [c for c in (own_langs or site_langs) if c in site_langs]
        for lang in langs:
            loc = f"{base}/{lang}/{path}"
            out.append("  <url>")
            out.append(f"    <loc>{loc}</loc>")
            out.append(f"    <lastmod>{lastmod}</lastmod>")
            for alt in langs:
                out.append(f'    <xhtml:link rel="alternate" hreflang="{languages[alt]["hreflang"]}" href="{base}/{alt}/{path}"/>')
            out.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{base}/{xdef}/{path}"/>')
            out.append("  </url>")
    out.append("</urlset>")
    (targets / "sitemap.xml").write_text("\n".join(out) + "\n", encoding="utf-8")


# 指南在列表页的呈现顺序：从"多长"到"怎么循环"到"图像"到"授权"，
# 按读者会问的顺序排，而不是按 slug 字母序。
GUIDE_ORDER = [
    "exact-30-second-background-music",
    "video-length",
    "seamless-loop-seam",
    "photo-to-song-lyrics",
    "commercial-use",
]


UNTRANSLATED: list[str] = []


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
            "asset_v": FOOD_ASSET_VERSION,
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
        if "</body>" in page:
            page = page.replace("</body>", ENV_LINK_FIX, 1)
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
            # 指南目前只有英文：不走"缺语言即报错"的检查，按 guides.json 里的语言生成
            langs_to_check = ["en"] if page == "guides" else site_langs
            missing = [c for c in langs_to_check if c not in source]
            if missing:
                print(f"✗ {source_key} 缺语言：{missing}", file=sys.stderr)
                return 1
            if source_key == "image":
                incomplete = {
                    lang: missing_translation_paths(source["common"], source[lang])
                    for lang in site_langs if lang != "en"
                }
                incomplete = {lang: paths for lang, paths in incomplete.items() if paths}
                if incomplete:
                    for lang, paths in incomplete.items():
                        print(f"✗ image.{lang} 缺翻译：{', '.join(paths)}", file=sys.stderr)
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
                    tools_base = f'https://{sites["tools"]["host"]}'.rstrip("/")
                    # 工具卡文案直接取工具站首页的第一张卡，不重复翻译
                    tools_copy = json.loads((CONTENT / "tools.json").read_text(encoding="utf-8"))[lang]["tools"][0]
                    return {
                        "title": esc(locale["title"]),
                        "h1": esc(locale["h1"]),
                        "lede": esc(locale["lede"]),
                        "apps_title": esc(locale["apps_title"]),
                        "open_label": esc(locale.get("open_label", "Open")),
                        "scholan_subtitle": esc(locale.get("scholan_subtitle", "")),
                        # App Store 各语言的 6.7" 市场截图，整张使用（不裁切）
                        "scholan_shot1": f"/assets/scholan/{lang}-1.jpg",
                        "scholan_shot2": f"/assets/scholan/{lang}-2.jpg",
                        "scholan_shot3": f"/assets/scholan/{lang}-3.jpg",
                        "tool_name": esc(tools_copy["name"]),
                        "tool_desc": esc(tools_copy["desc"]),
                        "tool_meta": esc(tools_copy["meta"]),
                        "tool_status": esc(tools_copy["status"]),
                        "tools_href": f"{tools_base}/{lang}/",
                        "about_text": esc(locale["about_text"]),
                        "scholan_meta": esc(locale["scholan_meta"]),
                        "learn_more": esc(locale["learn_more"]),
                        "support_label": esc(locale["support_label"]),
                        "scholan_desc": esc(_capitalize(marketing_title.split("—", 1)[1].strip())),
                        "scholan_href": f"{scholan_base}/{lang}/",
                        "scholan_support_href": f"{scholan_base}/{lang}/support.html",
                        "signin": esc(json.loads((CONTENT / "ui.json").read_text(encoding="utf-8"))[lang]["account"]["signin"]),
                        "account_label": esc(json.loads((CONTENT / "ui.json").read_text(encoding="utf-8"))[lang]["account"]["account_label"]),
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
                        "steps_1_h": esc(locale["steps"][0]["h"]),
                        "steps_1_p": esc(locale["steps"][0]["p"]),
                        "app_href": "https://apps.apple.com/app/id6811801616",
                        "shot_spread": "/assets/scholan/real/ipad-spread.jpg",
                        "shot_ipad_lib": "/assets/scholan/real/ipad-library.jpg",
                        "shot_phone": "/assets/scholan/real/phone-reading.jpg",
                        "shot_phone_lib": "/assets/scholan/real/phone-library.jpg",
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
            elif page == "guides":
                def guide_values(lang: str, base: str, slug: str, source=source) -> dict[str, str]:
                    copy = source[lang][slug]
                    return {
                        "title": esc(copy["title"]),
                        "description": esc(copy["description"]),
                        "body": copy["body"],
                        "robots": '<meta name="robots" content="noindex">' if page == "refund" else "",
                        "legal_privacy": esc(marketing[lang]["legal"]["privacy"]),
                        "legal_terms": esc(marketing[lang]["legal"]["terms"]),
                        "lang_label": esc(marketing[lang]["langLabel"]),
                        "current_name": esc(languages[lang]["name"]),
                        "jsonld": json.dumps({
                            "@context": "https://schema.org",
                            "@type": "Article",
                            "headline": copy["title"],
                            "description": copy["description"],
                            "url": f"{base}/{lang}/guides/{slug}.html",
                            "inLanguage": languages[lang]["hreflang"],
                            "publisher": {"@type": "Organization", "name": "aiglossa",
                                          "url": "https://aiglossa.com"},
                        }, ensure_ascii=False).replace("</", "<\\/"),
                    }

                # 译文按语言逐步补齐：guides.json 有的语言就生成，没有的跳过（不会生成假翻译）
                tools_copy = json.loads((CONTENT / "tools.json").read_text(encoding="utf-8"))
                for lang in [c for c in site_langs if c in source]:
                    # 列表页：该语言已有文章的汇总（rail 里那一行链接的落地页）
                    items = source[lang]
                    ordered = sorted(
                        items.items(),
                        key=lambda kv: GUIDE_ORDER.index(kv[0]) if kv[0] in GUIDE_ORDER else 99,
                    )
                    list_html = "".join(
                        f'<li><a href="{slug}.html">{esc(g.get("h1") or g["title"])}</a></li>'
                        for slug, g in ordered
                    )
                    emit(site, lang, 2, "guides/index.html", "pages/guide.html",
                         lambda lang, base, lh=list_html, tc=tools_copy: {
                             "title": esc(tc[lang]["guides_title"]) + " — aiglossa tools",
                             "description": esc(tc[lang]["description"]),
                             "body": f'<h1>{esc(tc[lang]["guides_title"])}</h1><ul class="guide-list">{lh}</ul>',
                             "legal_privacy": esc(marketing[lang]["legal"]["privacy"]),
                             "legal_terms": esc(marketing[lang]["legal"]["terms"]),
                             "lang_label": esc(marketing[lang]["langLabel"]),
                             "current_name": esc(languages[lang]["name"]),
                             "jsonld": json.dumps({"@context": "https://schema.org", "@type": "CollectionPage",
                                                   "name": tc[lang]["guides_title"],
                                                   "url": f"{base}/{lang}/guides/"}, ensure_ascii=False),
                         }, [c for c in site_langs if c in source])
                    for slug in source[lang]:
                        # 这一篇有哪些语言的版本，就声明哪些 hreflang（x-default 指英文）
                        have = [c for c in site_langs if slug in source.get(c, {})]
                        emit(site, lang, 2, f"guides/{slug}.html", "pages/guide.html",
                             lambda lang, base, slug=slug: guide_values(lang, base, slug), have)
                continue
            elif page == "music":
                def make_values(lang: str, base: str, source=source) -> dict[str, str]:
                    copy = source[lang].get("make") or source["en"]["make"]
                    if "make" not in source[lang]:
                        UNTRANSLATED.append(f"music · {lang}")
                    # 嵌套结构（如 recipe_names）原样透传，只对字符串转义
                    out = {k: (v if k in ("drop", "title", "description") or isinstance(v, dict) else esc(v))
                           for k, v in copy.items()}
                    out["drop"] = copy["drop"]                      # 含 <br>，按 HTML 原样插入
                    out["title"] = esc(copy["title"])
                    out["description"] = esc(copy["description"])
                    out["asset_v"] = FOOD_ASSET_VERSION
                    out["ui_json"] = json.dumps(copy, ensure_ascii=False).replace("</", "<\\/")
                    out["alt_sea"] = esc(copy["title"])
                    out["jsonld"] = json.dumps({
                        "@context": "https://schema.org",
                        "@type": "SoftwareApplication",
                        "name": copy["title"],
                        "description": copy["description"],
                        "applicationCategory": "MultimediaApplication",
                        "operatingSystem": "Web",
                        "url": f"{base}/{lang}/music/",
                        "inLanguage": languages[lang]["hreflang"],
                    }, ensure_ascii=False).replace("</", "<\\/")
                    out["legal_aup"] = esc(copy["legal_aup"])
                    out["refund_label"] = esc(copy["legal_refund"])
                    return out
                values_builder = make_values
            elif page == "music-share":
                def share_values(lang: str, base: str, source=source) -> dict[str, str]:
                    copy = source[lang].get("make") or source["en"]["make"]
                    share_copy = json.loads((CONTENT / "share.json").read_text(encoding="utf-8"))[lang]
                    merged = {**copy, "share_kicker": share_copy["kicker"], "share_try_cta": share_copy["try_cta"]}
                    out = {k: (v if isinstance(v, dict) else esc(v)) for k, v in merged.items()}
                    out["title"] = esc(copy["title"])
                    out["description"] = esc(copy["description"])
                    out["ui_json"] = json.dumps(merged, ensure_ascii=False).replace("</", "<\\/")
                    out["jsonld"] = json.dumps({"@context":"https://schema.org","@type":"AudioObject","name":copy["title"],"description":copy["description"]}, ensure_ascii=False).replace("</", "<\\/")
                    return out

                values_builder = share_values
            elif page == "food":
                def food_values(lang: str, base: str, source=source) -> dict[str, str]:
                    copy = source[lang]
                    out = {key: (value if isinstance(value, str) else value) for key, value in copy.items()}
                    out = {key: (esc(value) if isinstance(value, str) else value) for key, value in out.items()}
                    out["asset_v"] = FOOD_ASSET_VERSION
                    out["ui_json"] = json.dumps(copy, ensure_ascii=False).replace("</", "<\\/")
                    out["contact_email"] = "support@aiglossa.com"
                    out["legal_privacy"] = esc(marketing[lang]["legal"]["privacy"])
                    out["legal_terms"] = esc(marketing[lang]["legal"]["terms"])
                    out["legal_privacy_href"] = f"{legal_base}/{lang}/protocol/privacy.html"
                    out["legal_terms_href"] = f"{legal_base}/{lang}/protocol/term.html"
                    out["refund_href"] = f"https://tools.aiglossa.com/{lang}/refund.html"
                    out["lang_label"] = esc(marketing[lang]["langLabel"])
                    out["current_name"] = esc(languages[lang]["name"])
                    out["brand"] = esc("aiglossa food")
                    out["jsonld"] = json.dumps({
                        "@context": "https://schema.org", "@type": "SoftwareApplication",
                        "name": copy["title"], "description": copy["description"],
                        "applicationCategory": "HealthApplication", "operatingSystem": "Web",
                        "url": f"{base}/{lang}/food/", "inLanguage": languages[lang]["hreflang"],
                    }, ensure_ascii=False).replace("</", "<\\/")
                    return out
                values_builder = food_values
            elif page == "image":
                def image_values(lang: str, base: str, source=source) -> dict[str, str]:
                    common = source["common"]
                    copy = {**common, **source[lang]}
                    copy["options"] = {**common.get("options", {}), **source[lang].get("options", {})}
                    copy["recipe_names"] = {**common.get("recipe_names", {}), **source[lang].get("recipe_names", {})}
                    out = {key: (value if isinstance(value, (dict, list)) else esc(value)) for key, value in copy.items()}
                    out["asset_v"] = FOOD_ASSET_VERSION
                    out["ui_json"] = json.dumps(copy, ensure_ascii=False).replace("</", "<\\/")
                    out["jsonld"] = json.dumps({
                        "@context": "https://schema.org", "@type": "SoftwareApplication",
                        "name": copy["title"], "description": copy["description"],
                        "applicationCategory": "MultimediaApplication", "operatingSystem": "Web",
                        "url": f"{base}/{lang}/image/", "inLanguage": languages[lang]["hreflang"],
                    }, ensure_ascii=False).replace("</", "<\\/")
                    return out
                values_builder = image_values
            elif page == "image-share":
                def image_share_values(lang: str, base: str, source=source) -> dict[str, str]:
                    copy = {**source["common"], **source[lang]}
                    return {
                        "title": esc(copy["title"]), "description": esc(copy["description"]),
                        "share": esc(copy["share"]), "fullscreen": esc(copy["fullscreen"]),
                        "invalid": esc(copy["share_invalid"]), "kicker": esc(copy["share_kicker"]),
                        "shared_work": esc(copy["shared_work"]), "try_cta": esc(copy["try_cta"]),
                        "copied": esc(copy["copied"]),
                    }
                values_builder = image_share_values
            elif page in ("refund", "acceptable-use"):
                def legal_values(lang: str, base: str, page=page, source=source) -> dict[str, str]:
                    # 未翻译的语言回退到英文，并在构建报告里显式列出（不静默）
                    copy = source[lang].get(page) or source["en"][page]
                    if page not in source[lang]:
                        UNTRANSLATED.append(f"{page} · {lang}")
                    return {
                        "title": esc(copy["title"]),
                        "description": esc(copy["description"]),
                        "body": copy["body"],
                        "robots": '<meta name="robots" content="noindex">' if page == "refund" else "",
                        "legal_privacy": esc(marketing[lang]["legal"]["privacy"]),
                        "legal_terms": esc(marketing[lang]["legal"]["terms"]),
                        "refund_label": esc(source[lang]["pricing"]["refund_link"]),
                        "lang_label": esc(marketing[lang]["langLabel"]),
                        "current_name": esc(languages[lang]["name"]),
                    }

                values_builder = legal_values
            elif page == "webpricing":
                def webpricing_values(lang: str, base: str, source=source) -> dict[str, str]:
                    copy = dict(source[lang]["pricing"])
                    # 页面要用到的少量通用文案来自 make（余额/额度/未登录）
                    for k in ("balance", "credits", "not_signed_in"):
                        copy[k] = source[lang]["make"][k]
                    out = {k: esc(v) for k, v in copy.items() if isinstance(v, str)}
                    out["asset_v"] = FOOD_ASSET_VERSION
                    out["ui_json"] = json.dumps(copy, ensure_ascii=False).replace("</", "<\\/")
                    out["refund_note"] = esc(copy["refund_note"])
                    out["legal_privacy"] = esc(marketing[lang]["legal"]["privacy"])
                    out["legal_terms"] = esc(marketing[lang]["legal"]["terms"])
                    out["kicker"] = "aiglossa"
                    out["lede_buy"] = esc(source[lang]["pricing"]["lede_buy"])
                    out["li3_generic"] = esc(source[lang]["pricing"]["li3_generic"])
                    out["continue_use"] = esc(source[lang]["pricing"]["continue_use"])
                    out["pay_success"] = esc(source[lang]["make"]["pay_success"])
                    out["lang_label"] = esc(marketing[lang]["langLabel"])
                    out["current_name"] = esc(languages[lang]["name"])
                    return out

                values_builder = webpricing_values
            elif page == "webaccount":
                def webaccount_values(lang: str, base: str, source=source) -> dict[str, str]:
                    copy = source[lang]["account"]
                    out = {k: esc(v) for k, v in copy.items() if isinstance(v, str)}
                    merged = dict(copy)
                    pricing_copy = source[lang]["pricing"]
                    merged["refund_link"] = pricing_copy["refund_link"]
                    for k in ("pay_title", "pay_opening", "cancel", "credits", "pay_success"):
                        merged[k] = source[lang]["make"][k]
                        out[k] = esc(source[lang]["make"][k])
                    out["ui_json"] = json.dumps(merged, ensure_ascii=False).replace("</", "<\\/")
                    out["api_base"] = ""  # 由页面脚本按 hostname 选择（见 login/account 模板）
                    out["legal_privacy"] = esc(marketing[lang]["legal"]["privacy"])
                    out["legal_terms"] = esc(marketing[lang]["legal"]["terms"])
                    out["kicker"] = "aiglossa"
                    out["lede_buy"] = esc(pricing_copy["lede_buy"])
                    out["li3_generic"] = esc(pricing_copy["li3_generic"])
                    out["continue_use"] = esc(pricing_copy["continue_use"])
                    out["refund_label"] = esc(pricing_copy["refund_link"])
                    out["refund_href"] = f"https://tools.aiglossa.com/{lang}/refund.html"
                    out["lang_label"] = esc(marketing[lang]["langLabel"])
                    out["current_name"] = esc(languages[lang]["name"])
                    return out

                values_builder = webaccount_values
            elif page == "login":
                def login_values(lang: str, base: str, source=source) -> dict[str, str]:
                    copy = source[lang]["account"]
                    out = {k: esc(v) for k, v in copy.items() if isinstance(v, str)}
                    out["api_base"] = ""  # 由页面脚本按 hostname 选择（见 login/account 模板）
                    out["lang_label"] = esc(marketing[lang]["langLabel"])
                    out["current_name"] = esc(languages[lang]["name"])
                    return out

                values_builder = login_values
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
                        "cta_href": locale["cta_href"].lstrip("/"),   # 同目录：/{lang}/music/
                        # 首页列出当前语言已有的指南（没有译文的语言这一块为空）
                        # 法务标签取自 ui.json（工具页与工具站共用同一套译文）
                        "legal_aup": esc(json.loads((CONTENT / "ui.json").read_text(encoding="utf-8"))[lang]["make"]["legal_aup"]),
                        "guides_title": esc(locale.get("guides_title", "Guides")),
                        "account_label": esc(json.loads((CONTENT / "ui.json").read_text(encoding="utf-8"))[lang]["account"]["account_label"]),
                        "credits_unit": esc(json.loads((CONTENT / "ui.json").read_text(encoding="utf-8"))[lang]["account"]["credits_unit"]),
                        "recent_title": esc(json.loads((CONTENT / "ui.json").read_text(encoding="utf-8"))[lang]["make"]["mine_title"]),
                        "guides_list": "".join(
                            f'      <li><a href="guides/{slug}.html">{esc(g.get("h1") or g["title"])}</a></li>\n'
                            for slug, g in json.loads(
                                (CONTENT / "guides.json").read_text(encoding="utf-8")
                            ).get(lang, {}).items()
                        ),
                        "jsonld": json.dumps({
                            "@context": "https://schema.org",
                            "@type": "WebSite",
                            "name": "aiglossa tools",
                            "url": f"{base}/{lang}/",
                            "inLanguage": languages[lang]["hreflang"],
                            "publisher": {"@type": "Organization", "name": "aiglossa",
                                          "url": legal_base},
                        }, ensure_ascii=False).replace("</", "<\\/"),
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

        if not args.check:
            _write_seo_files(site, spec, site_langs, languages, default)
            if site == "food":
                _write_food_pwa(site, site_langs, languages)
        if not args.check and ASSETS.is_dir():
            target_assets = SITES_DIR / site / "assets"
            if target_assets.exists():
                shutil.rmtree(target_assets)
            if site == "food":
                target_assets.mkdir(parents=True)
                for name in FOOD_ASSETS:
                    source_asset = ASSETS / name
                    if source_asset.exists():
                        shutil.copy2(source_asset, target_assets / name)
            else:
                shutil.copytree(ASSETS, target_assets)
            written.append(f'{site:34s} -> sites/{site}/assets/（资源副本）')

    print(("校验通过（未写文件）" if args.check else "已生成页面") + "：")
    for line in written:
        print("  " + line)
    print(f"\n共 {len(sites)} 个站点，各站语言集合见上（全局默认 {default}）。")
    if UNTRANSLATED:
        print(f"\n⚠ 未翻译、回退英文的页面（{len(UNTRANSLATED)} 处）：")
        for item in UNTRANSLATED:
            print("   " + item)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
