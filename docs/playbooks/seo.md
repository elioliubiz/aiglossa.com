# SEO 上线与搜索引擎提交

> 适用范围：Aiglossa 新增生产站点、子域或可索引产品页。staging 全站 `noindex`，永远不提交搜索引擎。

## 先分清三种操作

| 操作 | 示例 | 作用 |
|---|---|---|
| 添加并验证网站 | `https://tools.aiglossa.com/` | 证明整个 host 的管理权 |
| 提交站点地图 | `https://tools.aiglossa.com/sitemap.xml` | 告诉搜索引擎该 host 有哪些可索引 URL |
| 请求抓取具体页面 | `https://tools.aiglossa.com/ko/music/` | 可选，只用于加快少量重要页面首次抓取 |

语言目录和产品目录不是独立网站。不要把 `/en/`、`/image/`、`/music/` 添加成网站；它们属于同一个 host，由 sitemap 与 `hreflang` 发现。

## 新站上线前

1. 在 `tools/content/sites.json` 登记生产 host、语言和页面。
2. 按 `AGENTS.md` 的“页面结构变更与 SEO”同步模板、`_site_urls()`、`vercel.json`、canonical 与 hreflang。
3. `noindex` 页面不得进入 sitemap；分享、登录、账户、私有结果和历史页维持既定策略。
4. 运行：

```bash
python3 tools/build.py
python3 tools/verify.py
```

5. 部署生产后确认：

```bash
curl -I https://<host>/robots.txt
curl -I https://<host>/sitemap.xml
curl -s https://<host>/sitemap.xml | grep -c '<loc>'
```

6. 根路径 `/` 可以按浏览器语言跳转，但提交和请求抓取必须使用稳定的实际语言 URL，如 `/en/` 或 `/ko/`。

## 每个生产 host 的提交清单

新增一个 host 后，在以下后台分别把 `https://<host>/` 添加为独立网站：

- Google Search Console：<https://search.google.com/search-console>
- Bing Webmaster Tools：<https://www.bing.com/webmasters/>
- Yandex Webmaster：<https://webmaster.yandex.com/>
- Naver Search Advisor：<https://searchadvisor.naver.com/>

验证完成后，每个平台都提交：

```text
https://<host>/sitemap.xml
```

不要提交 staging，不要按 16 种语言建立 16 个网站。

## Google Search Console

1. 添加生产 host 对应的资源并验证所有权。
2. 在“Sitemaps”提交完整 `https://<host>/sitemap.xml`。
3. “网址检查 → 请求编入索引”是可选的页面级加速，不是添加网站。优先请求默认英文入口及重要产品页，例如 `/en/`、`/en/image/`。
4. 不需要手动请求全部语言；sitemap 与 hreflang 会提供完整集合。

## Bing Webmaster Tools

1. 可以先尝试从 GSC 导入；没有导入的子域仍要手动添加。
2. 添加网站时填 `https://<host>/`，不要填英文页或 sitemap。
3. 验证优先使用 CNAME，并在 Cloudflare 设为“仅 DNS”。

Cloudflare 的名称相对于 `aiglossa.com`。主站和子域写法不同：

```text
主站：<bing-token>
Tools：<bing-token>.tools
Food：<bing-token>.food
```

最终必须能查到：

```text
<bing-token>.<host> CNAME verify.bing.com
```

不要把子域 token 错放成 `<bing-token>.aiglossa.com`。验证后保留记录。

4. 进入“网站地图”提交完整 sitemap URL。
5. “URL 提交”只用于少量核心英文页面，可选。

## IndexNow

IndexNow 是变更通知协议，不是站长后台。统一公开 Key 保存在 `tools/indexnow-key.txt`。同一个 Key 可以跨 host 使用，但每个 host 根目录都必须能访问同名验证文件：

```text
https://<host>/<key>.txt
```

`tools/build.py` 会为所有站点生成该文件。生产部署后先确认文件返回 `200`，再预览：

```bash
python3 tools/submit_indexnow.py
```

确认 host、Key 地址和 URL 数量后实际提交：

```bash
python3 tools/submit_indexnow.py --submit
```

工具按 host 分批读取生产 sitemap，不提交 staging 和 noindex 页面。`HTTP 200` 或 `202` 表示已接受。IndexNow 用于新增、修改和删除通知，不要定时反复提交未变化 URL。

## Yandex Webmaster

1. 每个生产 host 分别添加。
2. 主域可使用 DNS TXT；Vercel 子域已有 CNAME，避免再依赖同名 TXT 验证。即使公共 DNS 能查询到 TXT，Yandex 也可能沿 CNAME 查找而验证失败。
3. 子域统一使用 HTML 文件验证。当前文件位于：

```text
tools/yandex_aecf751203567a9a.html
```

构建器会复制到所有站点根目录。新增 host 后确认：

```text
https://<host>/yandex_aecf751203567a9a.html
```

4. 验证后进入 `Indexing → Sitemap files`，提交完整 sitemap URL。
5. 如果 Sitemap 工具显示只读，先不处理。`robots.txt` 已声明 sitemap，IndexNow 也已通知 Yandex；服务恢复后补交即可。

## Naver Search Advisor

Naver 主要用于韩语市场。后台常用菜单：

```text
요청 → 사이트맵 제출     请求 → 提交站点地图
요청 → 웹 페이지 수집    请求 → 收集网页
소유확인                  确认所有权
```

1. 每个生产 host 分别添加，验证选择“HTML 文件上传”。
2. Naver 通常为每个 host 生成不同文件。先收集完全部文件名，再统一构建发布，避免多次部署。
3. 文件名映射维护在 `tools/build.py` 的 `NAVER_VERIFICATION_FILES`；构建器生成标准内容，校验器检查 host 与文件一一对应。
4. 验证后在 `요청 → 사이트맵 제출` 填完整 URL：

```text
https://<host>/sitemap.xml
```

5. 可在 `요청 → 웹 페이지 수집` 填完整 URL，请求少量韩语核心页：

```text
https://<host>/ko/
```

产品站按需再提交 `/ko/image/`、`/ko/music/`、`/ko/food/`、`/ko/skin/`。不提交全部语言和全部页面。

## 无需单独提交的平台

- DuckDuckGo、Ecosia、Yahoo、Qwant：主要从 Bing、Google 或多来源获取结果，没有必要重复建立站长资产。
- Yahoo Japan：无需单独提交，日语页由 Google/Bing 覆盖。
- Brave Search、Apple Spotlight/Siri：当前没有必要的通用站点提交流程。
- Seznam：主要是捷克语市场，当前不支持捷克语。
- 百度：当前产品决策明确不考虑。

现有语言覆盖由 Google + Bing 提供基础覆盖，韩语补 Naver，俄语/土耳其语补 Yandex。不要为了语言数量继续堆低价值平台。

## 提交后一周检查

1. sitemap 是否处理成功，发现 URL 数是否与本地产物大致一致。
2. 是否出现 robots、重定向、404、canonical 或 hreflang 错误。
3. 核心语言页是否被识别为同一 hreflang 集合。
4. 关键页是否“已抓取但未编入索引”；先检查内容质量和内链，不要反复重提 sitemap。
5. 验证 DNS 与 HTML 文件长期保留，不要在验证成功后删除。

搜索引擎提交只负责发现。长期收录更依赖可索引文字、稳定内链、独立内容、外部链接与持续更新。
