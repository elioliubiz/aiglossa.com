# AGENTS.md — aiglossa.com

静态站。三个域名共用一套构建：`aiglossa.com`（品牌站）、`scholan.aiglossa.com`、`tools.aiglossa.com`（工具站）。

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

## 工具站（tools.aiglossa.com）现状

| 页面 | 多语言 |
|---|---|
| `/{lang}/index.html` 工具列表 | ✅ 16 种翻译 |
| `/{lang}/pricing.html` 价格 | ✅ 16 种翻译 |
| `/{lang}/account.html` 登录/账户 | ✅ 16 种翻译 |
| `/{lang}/refund.html` 退款政策 | ⚠️ 模板已就位，正文仅英文（其余语言回退，构建报告会列出） |
| `/{lang}/acceptable-use.html` 可接受使用 | ⚠️ 同上 |
| `/{lang}/make.html` 创作页 | ❌ 尚未迁移（仍是根目录静态页） |

未翻译的页面**回退英文并在 `build.py` 输出里逐条列出**，不静默；补齐翻译只需往 `tools/content/ui.json` 对应语言里加 key。

迁移方式与其他页面一致：模板进 `tools/templates/`，文案进 `tools/content/ui.json`，按语言生成到 `/{lang}/`。迁移时顺手把方向性 CSS 改成逻辑属性。

## 设计

工具站配色与创作页一致：`#0e0f11` 背景、`#ff7a1a` 主色、白色波形。共享主题在 `assets/theme.css`（只由工具站页面引入，避免污染品牌站的蓝紫色）。
