# aiglossa.com

Scholan 官网。纯静态站点，Vercel 直接托管，**部署侧没有任何构建步骤**（`tools/` 只在改动时本地运行）。

## 结构

```
index.html                 默认语言页（en）
<code>/index.html          其余 15 种语言页：zh-Hans、zh-Hant、ja、ko、es、fr、de、it、pt、ru、ar、th、vi、id、tr
assets/site.css            共用样式（方向性属性全部用逻辑属性，RTL 自动成立）
assets/site.js             只做"记住用户选过的语言"，不按浏览器语言/IP 自动跳转
assets/favicon.svg         favicon（矢量）
assets/apple-touch-icon.png 主屏图标 180×180
assets/og.png              分享预览图 1200×630
protocol/*.html            隐私协议 / 用户协议 / 注销说明
                           ⚠️ App 内硬编码了这些路径（/protocol/privacy.html 等），文件名与路径不要改
tools/strings.json         全部文案的唯一来源（16 种语言）
tools/build.py             由 strings.json 生成各语言页面
tools/verify.py            生成结果的结构自检
tools/og.html, icon.html   品牌图源文件（渲染成 assets/og.png、apple-touch-icon.png）
```

## 常用命令

```bash
python3 tools/build.py          # 生成全部语言页面
python3 tools/build.py --check  # 只校验（含"示例书语言 ≠ 站点语言"规则），不写文件
python3 tools/verify.py         # 结构自检：lang/dir、hreflang 条数、切换器条数、法律页参数、占位符残留
```

改完文案或模板：先 `build.py`，再 `verify.py`，然后把生成结果一起提交——线上不跑脚本。

## 语言

- 官网与 App 一致，支持 **16 种语言**：en、zh-Hans、zh-Hant、ja、ko、es、fr、de、it、pt、ru、ar、th、vi、id、tr。
- **`/` 恒为英文页**（`x-default` 也指向它），其余语言在 `/<code>/`。
- **不做** Accept-Language / IP 自动跳转：那会同时伤 SEO（爬虫只看到一种语言）与用户预期，
  也会让同一 URL 因请求头不同而无法被 CDN 缓存。只有"用户自己点过语言切换"才会在下次进 `/`
  时被送回该语言（`localStorage`，爬虫没有，因此索引不受影响）。
- 页脚语言切换器列出全部语言；**法律页链接会带上本页语言**：
  `protocol/privacy.html?lang=<code>`。三个协议页自身就支持该参数（初始化时优先读
  `URLSearchParams`，其次 localStorage、浏览器语言），且它们的 26 种语言键覆盖官网这 16 个代码。

## 约定

- **文案沿用官方译法**：App 里已有的说法（`files.guide.*` 等）直接取 App 的 16 语言 catalog，
  协议页链接名取自协议页自己的 `page_title`——保证官网、App、协议页三处用词一致，不另起一套。
  只有站点特有的串（示例卡、语言说明、SEO）是新写的。
- **示例书的语言必须不等于该页面的语言**（法语版不能拿法语书当"外文书"）。`build.py` 会校验，
  写错直接报错、不生成页面：目前 fr 页用 English 书、ja 页用 English 书，其余 14 种用
  Français + 日本語。
- **阿拉伯语页面**只需 `_languages.ar.dir = "rtl"`：样式全用逻辑属性，栅格自动镜像，
  外语词与卡头靠 `dir="auto"` 判定方向，不需要单独的镜像样式。
- 相对路径（`../assets/…`）是刻意的：本地双击 HTML 也能正常预览，部署后同样正确。

## 品牌图（需要改图时）

`tools/og.html` 与 `tools/icon.html` 是源文件，用无头 Chrome 渲染（本机已装 Chrome）：

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 \
  --screenshot=assets/og.png "file://$PWD/tools/og.html"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=180,180 \
  --screenshot=assets/apple-touch-icon.png "file://$PWD/tools/icon.html"
```

`assets/favicon.svg` 是手写的矢量图，直接改即可。

## 尚未完成

- App Store 下载入口：待上架后加（App Store ID 已定：6776256697）。
- og:image 目前是英文版（默认语言的分享卡片）；如需按语言出图可后续补。
