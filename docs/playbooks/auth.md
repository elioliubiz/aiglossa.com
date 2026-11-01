# 登录 / 退出 / 账户状态

> 最后核对：2026-11-01  
> 涉及：主站、tools、food、skin、scholan 回跳

## 目标

用户从任意产品页去主站登录，成功后回到**原来的页面**，页面立即显示已登录状态；退出后回到原来的公开页面，不强制去登录页。

## 标准流程

```text
产品页
→ https://aiglossa.com/<lang>/login.html?next=<当前产品页>
→ 登录成功
→ history.back() 回到原页面
→ 原页面 pageshow 刷新 /wallet/summary
```

只有没有上一页时，才用 `next` 兜底。

## 硬规则

1. 登录成功优先 `history.back()`，不要总是 `location.replace(next)`；后者会在历史里留下两份产品页。
2. 产品页必须在 `pageshow` 且 `event.persisted` 时刷新账户状态。
3. 退出登录优先 `history.back()`；没有上一页才回语言首页，不要强制去登录页。
4. 新增可回跳 host 时，同时更新：
   - `tools/templates/pages/login.html` 的 `allowedOrigins`
   - 后端 `WEB_ORIGINS`
   - 对应产品的 `pageshow` 刷新
5. 不要只隐藏前端登录按钮；后端仍要校验会话。
6. 登录页/相关 JS 改动后 bump 资源版本（如 `SKIN_ASSET_VERSION`），避免旧缓存。

## 当前已覆盖的页面

- 主站 header
- tools 首页
- tools/image
- tools/music
- skin
- food

Scholan 营销/支持页没有登录状态区域，不需要处理。

## 手动验证清单

对每个有登录入口的产品：

```text
1. 未登录打开产品页
2. 点登录
3. 登录成功
4. 确认回到原 URL
5. 确认右上角已变账户状态
6. 按一次浏览器返回，确认不会出现重复的同一个产品页
7. 进入个人中心
8. 退出登录
9. 确认回到原公开页面，而不是登录页
```

## 文件位置

```text
tools/templates/pages/login.html
tools/templates/pages/account.html
assets/skin.js
assets/food.js
tools/templates/tools.html
tools/templates/pages/image.html
tools/templates/pages/make.html
tools/templates/brand.html
```

## 已知坑

- 登录白名单少了某个产品 host → 回退到音乐页；
- `location.replace(next)` → 历史里出现两份同一页面；
- 只做跳转、不做 `pageshow` 刷新 → 页面看起来仍未登录；
- 退出登录固定跳登录页 → 对公开网页不合理。

详细事故记录见 `docs/REGRESSIONS.md`。
