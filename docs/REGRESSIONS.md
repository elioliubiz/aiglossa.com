# 已发生回归与预防

> 最后核对：2026-11-01  
> 目的：同一类错误不要靠记忆避免，尽量靠测试和固定流程避免。

| 问题 | 根因 | 修复 | 预防 |
|---|---|---|---|
| staging 产品通用链接返回 404 | 产品入口排在 host 通用重写之后 | 将产品入口移到重写列表前面 | `verify.py` 校验生产与 staging 顺序；部署后访问真实入口 |
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


### 2026-11：创作模板与字段联动

图片、音乐分别按后端 schema 渲染配方字段，模板固定字段由服务端约束。图片显隐条件必须返回明确布尔值：不能把 `undefined` 传入 `classList.toggle`，否则每次切换可能反转原有显示状态。草稿恢复需等待 schema 与模板列表加载完成，再恢复模板与参数，避免登录请求先返回时丢失现场。

`tools/verify_creative_ui.cjs` 使用独立 headless Playwright，验证中英阿三种语言的全部模板切换、歌词语言/来源联动、参考图显隐与 1600px 压缩，以及移动端页面宽度；不操作用户浏览器，不发起生成。运行前启动本地工具站代理，提供 Playwright 模块；可用 `CREATIVE_PREVIEW_URL`、`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定测试入口及独立浏览器程序。

配方输入控件收敛：除主描述、参考图说明、精确图片文字和自填歌词外使用枚举/有限多选，循环使用 switch。独立浏览器回归同时检查输入框数量、多选上限与清空、重复流派禁止、指定配色时隐藏泛色调。


### 2026-11：配方布局与控件由 schema 驱动

区域、tab、分组、排序及控件选择来自各工具 catalog；模板固定项与字段联动过滤后再隐藏空分组/tab。BPM 恢复 60–160 slider，保留自动与精确数值输入。专业区默认折叠，记录 tab/展开状态，调整计数与模板初始值比较，不统计固定或不适用字段。tab 提供键盘与 RTL 导航。

`tools/verify_creative_ui.cjs` 检查 slider 联动、默认折叠、空 tab、修改计数、模板基线和会话恢复，并在拦截的 schema 中新增字段/分组/tab，确认页面不需增加字段名分支。后端 `verify_creative_recipes.py` 拒绝错误布局引用、控件和范围配置。

- 音乐与图片的账户顶栏使用 `tool-topbar.css` 统一品牌、头像、余额、购买与指南样式；所有尺寸保留完整品牌与操作，不因窄屏隐藏品牌。图片指南定位本页说明，音乐指南进入音乐指南页。

- 音乐与图片工作区统一在 ≤1080px 切为纵向布局，≥1081px 使用双栏；顶栏品牌、滚动区域及专业设置吸顶条件须同步，不得各用不同断点。

- 官方示例统一从 `assets.aiglossa.com/showcase/<版本>/image.json`、`music.json` 读取；每模板一个，媒体不入仓库。音乐保留真实作品字段、原始歌词、时间轴与波形；展示封面不得当输入参考图。按 slug 匹配当前环境模板，禁止使用跨环境数据库 id。`tools/verify_official_samples.cjs` 检查 24 个示例恢复、完整图片、播放和移动端；旧公开媒体只有在线页面不再引用后才能删除。
