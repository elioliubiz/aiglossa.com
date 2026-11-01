# 构建与部署

> 最后核对：2026-11-01

## 分支

```text
dev   → staging.aiglossa.com / *.staging
main  → aiglossa.com / 生产子域
```

先 staging，确认后合 production。不要直接把只验证过一半的改动推 `main`。

## 本地构建

```bash
cd project/aiglossa.com
python3 tools/build.py
python3 tools/verify.py
```

两条都必须通过。生成产物提交进 Git，Vercel 不跑构建脚本。

## Vercel 构建门禁

项目 `aiglossa-com`：

```text
Settings → Build & Development Settings → Ignored Build Step
Behavior: Custom
```

命令：

```bash
if echo "$VERCEL_GIT_COMMIT_MESSAGE" | grep -q '\[deploy\]'; then exit 1; else exit 0; fi
```

规则：

- `exit 1` → 构建；
- `exit 0` → 跳过；
- 普通提交不生成部署；
- 发布时必须带 `[deploy]`：

```text
Release skin auth fix [deploy]
Merge dev into main [deploy]
```

Production Overrides 留空，沿用 Project Settings。

## 资源版本

改以下资源时必须 bump 对应版本，避免缓存旧文件：

- `SKIN_ASSET_VERSION`（skin.css/js/PWA）
- `FOOD_ASSET_VERSION`（food.css/js/PWA）
- 根站 `?v=...` favicon/图标

## 资源 allowlist

`build.py` 按站点复制资源，不再全量复制 `assets/`。

新增资源/站点时：

1. 更新对应 `*_ASSETS`；
2. 构建；
3. 检查 HTML/CSS 引用；
4. 确保 `sites/*/assets` 没有未引用副本；
5. 不要提交构建产生的重复文件。

## 部署后检查

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://aiglossa.com/zh-Hans/
curl -s https://aiglossa.com/sitemap.xml | grep -c "<loc>"
curl -s -o /dev/null -w "%{http_code}\n" https://skin.aiglossa.com/zh-Hans/skin/
```

登录/支付相关变更还要手动走一遍：

```text
登录返回
退出返回
账户状态刷新
```

## 回滚与清理

- Vercel 保留当前 Production + 最近 2–3 个 Preview/Production 即可；
- 旧部署会占 Deployment Storage；
- 不要为了“保留历史”保留所有部署，Git 已有源码历史；
- 删除旧部署不会影响当前域名和 Git。

## 发布边界

- staging 不提交 GSC；
- 生产 sitemap 提交一次即可，不要反复重提；
- 分享页/登录页/账户页 noindex；
- 结构变化后检查 sitemap、canonical、hreflang、robots。
