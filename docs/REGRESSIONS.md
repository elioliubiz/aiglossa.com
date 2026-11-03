# 已发生回归与预防

> 最后核对：2026-11-01  
> 目的：同一类错误不要靠记忆避免，尽量靠测试和固定流程避免。

| 问题 | 根因 | 修复 | 预防 |
|---|---|---|---|
| skin 登录后跳到音乐页 | 登录页 `allowedOrigins` 漏了 skin | 加 skin 生产/测试 origin | 新 host 必须同时改前端白名单和后端 `WEB_ORIGINS` |
| 登录后返回栈多一层 | 登录页 `location.replace(next)` 替换登录页，原产品页仍在 | 有上一页时 `history.back()` | 产品页 `pageshow` 刷新；手动测试返回栈 |
| 登录后右上角仍显示未登录 | 回到 bfcache/原页面后没有重新请求账户 | 增加 `pageshow` 刷新 `wallet/summary` | 有登录 UI 的页面必须有 pageshow 测试 |
| 个人中心退出后进登录页 | 退出逻辑固定跳登录 | 退出优先 `history.back()`，无上一页回首页 | 公开网页退出不应强制登录 |
| 部署数量暴涨 | 每次 push 自动部署 + 静态产物重复 | Vercel Ignored Build Step + 清理旧部署 | 普通提交不带 `[deploy]`；定期保留 6 个左右 |
| root/tools 出现未跟踪资源副本 | 每个站点全量复制 assets | 改成按站点 allowlist | 新增站点/资源更新 allowlist；构建后检查引用 |
| 根站说明文字异常换行 | 用 `ch` 做宽度，中文实际宽度偏差 | 改成固定 px 上限 | 中文/多语言文本不要用 `ch` 估算换行 |
| 测试页产品链接跳到生产 | 静态链接写死生产 host，staging 未改写 | staging 运行时改写 Web 产品链接；App 例外 | 新增跨站链接时检查 staging 行为 |
| Scholan 网页图标仍旧 | 只改 App 图标，网页仍用旧 favicon | 生成 Scholan 专用 favicon/ICO/touch icon | 网站图标变更必须检查 `/favicon.ico` 和页面 `<link>` |
| Scholan 根路径始终进入英文 | Scholan 专用 `/` → `/en/` 永久跳转先于语言规则 | 为正式 host 补齐 16 条按浏览器语言排序的根路径跳转 | 修改 `vercel.json` 后用中英文 `Accept-Language` 分别验证 |

## 新增回归的格式

```text
症状：
根因：
修复：
预防/测试：
```

能用自动化测试锁住的，不要只写表格。
