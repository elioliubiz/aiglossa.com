# App 通用链接

统一格式：`https://aiglossa.com/<app_key>/inapp?action=<密封串>`。
当前产品为 scholan、coeia，各自精确匹配路径；不保留 `/inapp` 兼容入口。
`action` 是共享 GsNet 密封串，不因产品路径变化而更换加密协议。

## 维护

1. 在 `tools/content/app-links-registry.json` 配置产品名、TeamID.BundleID、商店地址。
2. 新产品同时补 `vercel.json` 产品入口正则与客户端路径解析。产品入口必须排在生产和 staging 各自的 `/:path*` 通用重写之前。
3. 文案在 `tools/content/app-links.json`，覆盖站点全部 16 种语言。
4. 执行 `python3 tools/build.py` 与 `python3 tools/verify.py`。AASA、分流页及多语言下载页均由构建生成。

公开产品入口先按浏览器语言进入对应下载页，下载页 noindex；不执行 action，也不将其发送给商店。
生产与 staging 均有产品入口重写，AASA 以 JSON 提供；客户端仅关联生产域名。
部署顺序为 staging 验证后再 production；Apple AASA 缓存可能延迟生效，网页成功不代表系统关联已刷新。

验证安装/未安装、冷启动/热启动，以及两个产品路径不会互相打开。所有发送链接的后台与运营工具都应按目标 app_key 构造路径。
