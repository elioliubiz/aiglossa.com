# AGENTS.md — aiglossa.com

静态站。生产域名与 staging 域名共用一套构建：品牌站分别为 `aiglossa.com` / `staging.aiglossa.com`，
工具站分别为 `tools.aiglossa.com` / `tools.staging.aiglossa.com`；staging 域名固定绑定 Vercel `dev` 分支。

## 构建

```bash
python3 tools/build.py      # 生成 sites/<site>/<lang>/…
python3 tools/verify.py     # 校验产物、hreflang、canonical、断链
```

产物**提交进仓库**（Vercel 零构建）。改动后必须两件事都做：`build.py` 跑一遍，`verify.py` 必须干净，再提交。

## 多语言是硬约束（最重要的一条）

**16 种语言**，`tools/content/languages.json` 是唯一来源：

```
ar de en es fr id it ja ko pt ru th tr vi zh-Hans zh-Hant
```

站点可以在 `tools/content/sites.json` 里用 `langs` 收窄语言集合，但**默认与主站对齐**——工具站曾经只做英文，导致首页做完后工具页要重做一遍。

### 规则

1. **不允许写死单一语言的 HTML**。页面 = 模板 + 每语言一份文案，由 `build.py` 逐语言生成 `sites/<site>/<lang>/…`。
2. 文案放在 `tools/content/*.json`，结构是 `{lang: {key: value}}`。缺语言时构建会因为 `sites.json` 的 `langs` 校验失败——**这正是我们要的**，不要用英文兜底掩盖未翻译。
3. **新增页面要同时登记四处**，少一处就出错：
   | 位置 | 作用 |
   |---|---|
   | `tools/templates/<page>.html` | 模板 |
   | `tools/content/<page>.json` | 每语言文案 |
   | `tools/build.py` | 页面分支 + `sites.json` 的 `pages` |
   | `tools/verify.py` 的 `PAGES` | 产物与 URL 的映射 |
4. `sites.json` 的 `extra` 只放**语言无关**的手写产物（如 `.well-known/apple-app-site-association`）。任何有文字的页面都不能进 `extra`。
5. 根路径要有 301：`/` → `/<默认语言>/`（见 `vercel.json` 的 redirects，每个域名一条）。

## CSS：一律用逻辑属性

阿拉伯语（`ar`）页面是 `dir="rtl"`，靠 `<html>` 属性自动镜像排版。前提是样式全用逻辑属性：

```css
/* ✅ */  padding-inline: 24px;  margin-inline-start: 8px;  inset-inline: 12px;  text-align: start;
/* ❌ */  padding-left: 24px;   margin-left: 8px;          left: 12px;           text-align: left;
```

写新页面时按这个来，否则 RTL 下必错位，事后返工成本很高。

## 站内链接

- 同一语言目录内的页面互相链接**用相对路径**（`make.html`、`pricing.html`），这样自动带语言，不需要拼接前缀。
- 跨语言由模板的 `{{switcher}}` 与 `hreflang` 处理，不要手写。
- 指向源码站的链接（如法律页）显式带语言：`https://aiglossa.com/<lang>/protocol/privacy.html`。
- 生成器里的片段若要拼前缀，用 `{{prefix}}`；`render()` 只替换一遍，插入片段里的占位符需要 `emit()` 里补替换（见 `build.py`）。

## 边界：哪些域名不属于这个仓库

| 域名 | 归属 | 这个仓库能不能动 |
|---|---|---|
| `aiglossa.com`、`scholan.aiglossa.com`、`tools.aiglossa.com` | 本仓库 `main`，Vercel 部署 | ✅ |
| `staging.aiglossa.com`、`tools.staging.aiglossa.com` | 本仓库 `dev`，Vercel Preview 部署 | ✅ |
| `dev.staging.aiglossa.com`、`api.aiglossa.com` | **后端仓库**（FastAPI）在服务器上自建 | ❌ |

测试 / 正式 API 域名由服务器上的 nginx + systemd 管理，**与本前端工程无关**：不要把静态站部署到它们上面。前端页面只把 `https://dev.staging.aiglossa.com` 和 `https://api.aiglossa.com` 当 API 使用。

固定公网测试入口是 `https://staging.aiglossa.com` 与 `https://tools.staging.aiglossa.com`；本地工具站入口是 `http://localhost:8000`。

## 新增一个工具（扩展点）

工具页是**目录**，不是 `make.html` 这种名字：

```
/{lang}/music/      音乐（现有）
/{lang}/image/      图片（未来）
/{lang}/text/       文本（未来）
/{lang}/pricing.html   全局页仍在语言根
```

新增工具要同时改五处（缺一处就 404 或构建失败）：

| 位置 | 改动 |
|---|---|
| `tools/templates/pages/<tool>.html` | 新模板 |
| `tools/content/ui.json` | 每个语言加 `<tool>` 键 |
| `tools/build.py` 的 `PAGES` | `"<tool>": ("pages/<tool>.html", "ui", "<tool>/index.html")` |
| `tools/verify.py` 的 `PAGES` | `return [("<tool>/index.html", "<tool>/")]` |
| `vercel.json` | rewrite `/:lang/<tool>/` → `/sites/tools/:lang/<tool>/index.html`；sitemap 的 `url_for` 加分支 |

模板在深度 2，资源按 `{{prefix}}` 自动变成 `../../`；站内跳转回语言根用 `../pricing.html`。

## 工具站（tools.aiglossa.com）现状

### 支付与额度（所有工具共用的边界）

额度是工具平台能力，不属于音乐工具。工具页面只负责决定何时需要额度、显示自己的余额区域，以及在充值完成后刷新自己的 UI；不得在页面内直接写 `location.href = checkout_url`，也不得自行实现 Creem 轮询。

共享支付流程位于 `assets/wallet.js`：它在新标签页打开 Hosted Checkout，原工具页保持不卸载，按服务端余额轮询等待 webhook 入账，到账后关闭支付标签页并调用页面回调。充值完成后**不自动重试或继续执行原业务操作**，由用户自行再次点击业务按钮。

业务页接入时应提供：`call`、`credits`、`successUrl`、`getBalance`、`refresh`，并通过 `onCompleted` 更新自己的余额显示。到账以 `/wallet/checkout/status` 为准，随后用 `/wallet/summary` 刷新余额；支付页回跳、`postMessage` 或 Creem 成功页只能作为提示。

钱包 API 只使用 `/wallet/summary`、`/wallet/products`、`/wallet/checkout`、`/wallet/checkout/status`。不要再向 `/ai/music/` 添加余额或支付端点；该前缀只属于音乐生成、配方和作品。

“购买额度”按钮可以复用钱包能力，但整行余额栏、指南入口等布局不作为跨工具统一 View；不同工具自行组织页面 UI。

| 页面 | 多语言 |
|---|---|
| `/{lang}/index.html` 工具列表 | ✅ 16 种 |
| `/{lang}/music/` 音乐工具 | ✅ 16 种（参数标签来自后端 `labels_i18n.py`） |
| `/{lang}/pricing.html` 价格 | ✅ 16 种 |
| `/{lang}/account.html` 登录/账户 | ✅ 16 种 |
| `/{lang}/refund.html` 退款政策 | ✅ 16 种 |
| `/{lang}/acceptable-use.html` 可接受使用 | ✅ 16 种 |

**已无静态页**：工具站所有页面都由 `build.py` 按语言生成，旧地址 `/make.html`、`/{lang}/make.html` 由 `vercel.json` 301 到 `/{lang}/music/`。
构建若出现未翻译内容会打印 `⚠ 未翻译` 清单（当前为 0）。

迁移方式与其他页面一致：模板进 `tools/templates/`，文案进 `tools/content/ui.json`，按语言生成到 `/{lang}/`。迁移时顺手把方向性 CSS 改成逻辑属性。

## 设计

工具站配色与创作页一致：`#0e0f11` 背景、`#ff7a1a` 主色、白色波形。共享主题在 `assets/theme.css`（只由工具站页面引入，避免污染品牌站的蓝紫色）。

## 官方媒体资源

官方示例音频不属于 Vercel 前端产物，统一由 `https://assets.aiglossa.com/music-samples/` 提供；测试和生产共用这批只读资源。仓库的 `sites/tools/samples/` 只保存示例图片和 `waveforms.json`，禁止提交 MP3、WAV、FLAC 等音频文件。

服务器源文件位于 `/opt/glossa-shared/public/music-samples/`，Nginx 只能公开这个子目录，不得映射整个 `/opt/glossa-shared/`（其中包含敏感 env）。本机独立备份位于项目根之外的 `private-assets/music-samples/`。

示例音频更新后，在仓库根运行 `python3 tools/generate_waveforms.py /绝对路径/music-samples` 重新生成波形，再执行常规的 `build.py` 与 `verify.py`。页面和后端配方必须使用稳定的 `assets.aiglossa.com` URL，不能退回相对 `/samples/` 地址。
