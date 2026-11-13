# aiglossa.com 架构速览

> 最后核对：2026-11-01

## 这是什么

多站点静态站生成器。一个仓库生成 6 个站点、16 种语言，提交生成产物到 Git，由 Vercel 直接托管，不在 Vercel 上运行构建脚本。

```text
root      aiglossa.com                 品牌 / 登录 / 账户 / 定价 / 法律
tools     tools.aiglossa.com           音乐、图片、指南、法律
scholan   scholan.aiglossa.com         Scholan 营销 / 支持
coeia     coeia.aiglossa.com           Coeia 营销 / 支持
food      food.aiglossa.com            食品标签分析
skin      skin.aiglossa.com            护肤成分分析
```

staging 对应：

```text
staging.aiglossa.com
tools.staging.aiglossa.com
food.staging.aiglossa.com
skin.staging.aiglossa.com
coeia.staging.aiglossa.com
```

Scholan 没有独立 staging 站；测试页上的 Scholan 卡片指向生产。

## 构建链路

```text
tools/content/*.json       文案（16 语言）
tools/templates/*.html     页面模板
assets/                    源资源
tools/build.py             生成 sites/<site>/<lang>/...
tools/verify.py            校验 hreflang / canonical / 产物
sites/                     提交进 Git 的生成产物
```

命令：

```bash
cd project/aiglossa.com
python3 tools/build.py
python3 tools/verify.py
```

硬规则：

- 不要手改 `sites/` 下的生成 HTML；改模板或内容后重新构建；
- 构建后必须跑 `verify.py`；
- 生成产物需要提交，Vercel 零构建；
- 语言集合来自 `tools/content/languages.json`，不要写死单语言页面。

## 资源复制

`build.py` 按站点 allowlist 复制资源，不做全量 `copytree`：

- `ROOT_ASSETS`
- `TOOLS_ASSETS`
- `SCHOLAN_ASSETS`
- `COEIA_ASSETS`
- `FOOD_ASSETS`
- `SKIN_ASSETS`

新增页面/资源时，确认对应站点 allowlist 包含它；否则生产 404。  
构建后不要提交 `sites/*/assets` 下没有引用的重复副本。

## 路由与 SEO

- `vercel.json` 负责 host rewrite、根路径语言跳转、favicon、staging noindex；
- 根路径不能用固定 `/en/`，必须按 `Accept-Language` 跳转；
- 每个页面 canonical 指向自身 host；
- hreflang 只在本 host 内闭环；
- sitemap 由 `build.py` 生成，`lastmod` 会随构建日期变化；
- login / account 等 noindex 页面不进 sitemap；
- 主站 sitemap 在 `https://aiglossa.com/sitemap.xml`，产品站各自独立。

## 认证与环境

- 登录页在主站，产品站通过 `next` 回到产品页；
- Cookie domain 为 `.aiglossa.com`，子域共享；
- staging 与 production 使用不同 API：
  - staging → `https://dev.staging.aiglossa.com`
  - production → `https://api.aiglossa.com`
- 后端是独立仓库，不在本仓库部署。

生产 API 与 staging API 的 `WEB_ORIGINS` 必须分开：生产只允许生产域名，staging 只允许 staging/localhost；不要把两套 origin 合并到同一个白名单。

## 分支与部署

```text
dev   → staging（Vercel Preview）
main  → production（Vercel Production）
```

- 先 staging 验证，再合 production；
- Vercel 只在提交信息包含 `[deploy]` 时构建；
- 普通提交不生成新部署；
- 详细规则见 `docs/playbooks/deploy.md`。

## 不属于本仓库

- `api.aiglossa.com` / `dev.staging.aiglossa.com`：后端仓库；
- 数据库、Creem、AI Key：后端环境变量；
- 不要在静态站代码里放任何支付密钥或 AI Key。
