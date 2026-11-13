# Coeia 产品网站

Coeia 与 Scholan 共用静态站生成器，但拥有独立模板、文案、图标和截图。

## 地址与域名

| 环境 | 产品首页 | 技术支持 |
|---|---|---|
| 生产 | `https://coeia.aiglossa.com/<lang>/` | `https://coeia.aiglossa.com/<lang>/support.html` |
| 测试 | `https://coeia.staging.aiglossa.com/<lang>/` | `https://coeia.staging.aiglossa.com/<lang>/support.html` |

`<lang>` 使用网站的 16 语言码，如 `en`、`zh-Hans`、`ar`，不是 App Store Connect 的 `en-US`、`ar-SA`。
根路径按 Accept-Language 跳转；测试域名统一返回 `X-Robots-Tag: noindex`。canonical 与 sitemap 使用生产域名。
法律文档继续共用主站的隐私、条款及账号删除说明，不在产品子域复制。

## 内容与资源

- `tools/content/coeia-marketing.json`：产品介绍及翻译对照标签。
- `tools/content/coeia-support.json`：导入、翻译注意事项、本地存储、导出、画片及账号删除 FAQ。
- `tools/templates/coeia-*.html`：页面结构。
- `assets/coeia/`：App 图标与经过压缩的真实截图；不在网站上伪造译文。
- `tools/build.py`：`COEIA_ASSETS` allowlist 与 `COEIA_ASSET_VERSION`；网站不注册 PWA/service worker。
- `sites/coeia/`：需提交的生成产物，不手工编辑。

漫画、译文与画片存储在设备上，不提供内容云同步；不可沿用 Scholan 的云端书籍归属说明。
翻译为付费功能，先少量尝试确认效果；不承诺模糊图片或特殊字体的翻译质量。

## 首次上线

1. 在 DNS 与 Vercel 分别添加生产和测试 host，测试域名绑定 dev 分支。
2. 执行 `python3 tools/build.py` 和 `python3 tools/verify.py`。
3. 先部署 staging（提交信息带 `[deploy]`），验收后再合 production。
4. 域名生效后，对两个域名分别用 `curl -I -H 'Accept-Language: zh-CN' https://<host>/` 和 `en-US` 检查跳转，确认支持页及资源返回 200、测试站 noindex。
5. App Store 的 marketingUrl/supportUrl 按语言填写生产地址；站点未上线前不填成不可访问的地址。
6. 上线后提交 `https://coeia.aiglossa.com/sitemap.xml`。Naver 验证文件等注册取得本域名 token 后再配置，不借用 Scholan 的验证 token。

## SEO 验收

产品与支持页都提供独立的 title/description、canonical、16 语言 hreflang 与 x-default、Open Graph、Twitter 卡片和单一 H1。产品使用 SoftwareApplication 结构化数据，支持页使用 ContactPage 与 FAQPage；不添加虚构评分或免费价格。分享图为 1200 × 630。

`/<lang>/index.html` 永久跳转到 `/<lang>/`，根路径语言协商声明 `Vary: Accept-Language`，robots/sitemap 明确返回文本/XML 类型。生产 sitemap 只列 32 个实际语言页面，带 lastmod。测试 host 全站维持 noindex，canonical 指向生产。

`tools/verify.py` 校验两页元信息、JSON-LD、资源、语言路由及自身 host 的 canonical/hreflang。发布后必须再次 curl 验证真实响应，不把本地通过当作已上线。
