# aiglossa.com

纯静态站点，Vercel 直接托管，**部署侧没有任何构建步骤**（`tools/` 只在改动时本地运行）。

同一个仓库承载**根域**与**各 App 子域**，靠 `vercel.json` 按 Host 路由到对应目录。

## 结构：目录即 URL

```
sites/<site>/<lang>/<page>   ↔   https://<host>/<lang>/<page>
```

`<site>` 是短代号（`root` = 根域，其余为各 App），host 在 `tools/content/sites.json` 里声明：

```
sites/root/<lang>/index.html                     品牌页：自我介绍 + 应用列表
sites/root/<lang>/protocol/privacy.html          隐私协议
sites/root/<lang>/protocol/term.html             用户协议
sites/root/<lang>/protocol/delete-account.html   注销说明
sites/scholan/<lang>/index.html                  Scholan 介绍页
sites/scholan/<lang>/support.html                Scholan 支持页（FAQ + 联系方式）
sites/<site>/assets/                             各站点自己的资源副本（Host 重写会把 /assets 也指进来）
```

**协议页只放根域**（所有 App 共用一套法律文本、同一个 Privacy Policy URL）；
**支持页放各 App 子域**（FAQ、计费、退款口径按 App 不同）。这条分工是刻意的，加 App 时不要复制协议页。

```
assets/site.css            品牌页/介绍页共用样式（方向性属性全用逻辑属性，RTL 自动成立）
assets/site.js             只做"记住用户选过的语言"，不按浏览器语言/IP 自动跳转
assets/protocol.css        协议页 + 支持页共用样式
assets/favicon.svg         favicon（矢量）
assets/apple-touch-icon.png 主屏图标 180×180
assets/og.png              分享预览图 1200×630
vercel.json                Host 重写（域名 → sites/<site>/）+ 根路径 301
tools/content/             唯一文案来源：languages / sites / brand / marketing / protocol / support
tools/templates/           页面模板：brand / marketing / support / protocol/<页名>
tools/build.py             由 content + templates 生成 sites/ 下的全部页面
tools/verify.py            产物自检（见下）
tools/og.html, icon.html   品牌图源文件（渲染成 assets/og.png、apple-touch-icon.png）
```

## 分支与环境

**`dev` 是开发主分支，`main` 只在合并时动。**

App 靠 Build Configuration 在编译期选服务器；网页没有编译步骤，所以**环境由域名决定**：
同一份产物跑到哪个域名，就连哪个后端。这样一份代码同时服务两套环境，预览部署也永远不可能误连生产。

| 分支 | Vercel 部署 | 域名 | 后端 |
| --- | --- | --- | --- |
| `dev` | Preview（绑定分支） | `dev.tools.aiglossa.com` | `https://dev.aiglossa.com` |
| `main` | Production | `tools.aiglossa.com` | `https://api.aiglossa.com` |
| 其他分支 / PR | Preview（随机 URL） | `*.vercel.app` | 同 `dev` |

- 「域名 → 分支」的绑定在 Vercel 面板的 Domains 里设置（Assign to Git Branch），只做一次。
- 前端判断环境只看 `location.hostname`，**不引入构建期环境变量**：纯静态站没有构建，
  运行期判断反而更简单，也不会出现「预览包写死了生产地址」这类事故。
- 后端 CORS 与之对应：`dev` 放行 `dev.tools.aiglossa.com` 与 `*.vercel.app`，
  `main` 只放行 `tools.aiglossa.com`。

**合并时的唯一注意点**：`sites/` 是生成产物，两条分支改过同一页时会冲突。
不要手工解冲突——合到 `main` 后重跑一次 `build.py`，产物必然收敛（脚本是确定性的）：

```bash
git merge dev
python3 tools/build.py      # 覆盖冲突的产物
git add sites/ && git commit
python3 tools/verify.py     # 确认 hreflang/canonical/vercel.json 仍自洽
```

## 常用命令

```bash
python3 tools/build.py          # 生成全部页面，并把 assets 复制到各站点
python3 tools/build.py --check  # 只校验（文案齐全、占位符都能对上、示例书语言规则），不写文件
python3 tools/verify.py         # 产物自检：产物与声明一一对应、hreflang/canonical、Host 重写齐全
```

改完文案或模板：先 `build.py`，再 `verify.py`，然后把生成结果一起提交——线上不跑脚本。

## 语言与 URL

- **16 种语言**：en、zh-Hans、zh-Hant、ja、ko、es、fr、de、it、pt、ru、ar、th、vi、id、tr。
- **语言一律带前缀（含默认语言 en）**：`/en/…`、`/zh-Hans/…`。
  这样客户端只要把语言码拼进路径，**不需要知道默认语言是谁**；语言切换器也只是换路径第一段。
- **根路径 `/` 做 301 → `/en/`**（每个站点各自一条），所以裸域名不会停留在没有语言的地址上。
- **不做** Accept-Language / IP 自动跳转：那会同时伤 SEO（爬虫只看到一种语言）与用户预期，
  也会让同一 URL 因请求头不同而无法被 CDN 缓存。只有"用户自己点过语言切换"才会在下次进入口页
  （`/` 或 `/<默认语言>/`）时被送回该语言（`localStorage`，爬虫没有，因此索引不受影响）。
- 页脚语言切换器列出全部语言；协议页顶部的下拉用相对路径，无 JS 也能正常阅读（**每语言是独立文件**，
  语言不靠 JS 替换——旧实现是单文件内嵌 26 语言、靠 JS 换文案，会出现"先闪一屏中文"，
  且 App 内每次要下载 380KB；现在是 ~18KB 且首帧即正确语言）。

## 加一个新的 App（例如 Coeia）

1. `tools/content/sites.json` 加一条：`"coeia": {"host": "coeia.aiglossa.com", "pages": ["marketing", "support"]}`；
   若该站只做少数语言（例如英文优先的工具站），在同一条里加 `"langs": ["en"]`——不写就是全部 16 种，
   写了之后该站点的 hreflang、x-default、校验都以这个集合为准；
2. `tools/content/` 加 `coeia` 的营销/支持文案（可先复制 `marketing.json`/`support.json` 的结构）；
3. `vercel.json` 复制一条 Host 重写（`coeia.aiglossa.com` → `/sites/coeia/:path*`）与一条根路径 301；
4. `tools/build.py` 的 `PAGES` 里按需登记页面名（营销/支持可直接复用现有模板）；
5. 根域品牌页 `tools/templates/brand.html` 里复制一个 `.app` 块，并加一组 `{{app2_*}}` 文案；
6. Cloudflare 加一条 CNAME（指向 Vercel 给的目标，**DNS only**），Vercel 项目里加该域名；
7. `build.py` → `verify.py` → 提交。

**协议页不用动**：它们属于根域，所有 App 共用。

## 约定

- **文案沿用官方译法**：App 里已有的说法直接取 App 的 16 语言 catalog；
  支持页里的"注销账号"链接名取自协议页自己的 `page_title`，"隐私协议/用户协议"取自介绍页的
  `legal`，页脚取自协议页的 `footer`——同一句话不在多处各写一份。
  只有站点特有的串（品牌页自我介绍、示例卡、FAQ）是新写的。
- **示例书的语言必须不等于该页面的语言**（法语版不能拿法语书当"外文书"）。`build.py` 会校验，
  写错直接报错、不生成页面。
- **阿拉伯语页面**只需 `languages.json` 里 `ar.dir = "rtl"`：样式全用逻辑属性，栅格自动镜像，
  外语词与卡头靠 `dir="auto"` 判定方向，不需要单独的镜像样式。
- 相对路径（`../assets/…`）是刻意的：本地双击 HTML 也能正常预览，部署后同样正确。
  跨站点的链接（品牌页 → Scholan 子域、支持页 → 根域协议页）用绝对 URL。

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

- App Store 下载入口：待上架后加到品牌页的 Scholan 卡片（App Store ID 已定：6776256697）。
- og:image 目前是英文版（默认语言的分享卡片）；如需按语言出图可后续补。
