# aiglossa.com 项目记忆索引

> 最后核对：2026-11-01  
> 用途：让新的 AI 对话或维护者只读必要上下文，就能安全改这个项目。

## 先读什么

| 文件 | 什么时候读 |
|---|---|
| `AGENTS.md` | 每次任务 |
| `docs/ARCHITECTURE.md` | 不熟悉项目结构、构建、站点拓扑时 |
| `docs/DESIGN_SYSTEM.md` | 修改页面风格、主题、组件或产品色时 |
| `docs/playbooks/auth.md` | 登录、退出、账户状态、跨子域回跳 |
| `docs/playbooks/payments.md` | Creem、充值、额度、支付回调 |
| `docs/playbooks/deploy.md` | 构建、staging、生产、Vercel、资源版本 |
| `docs/playbooks/seo.md` | sitemap、搜索引擎资产、IndexNow 提交 |
| `docs/playbooks/coeia.md` | Coeia 产品/支持页、独立域名及首次上线 |
| `docs/playbooks/app-links.md` | 产品通用链接、AASA、未安装回落 |
| `docs/REGRESSIONS.md` | 改到相关模块前，先看有没有踩过坑 |

不要把全部文档一次塞进上下文。  
按任务读：例如改登录只读 `auth.md`，不要读支付和部署全文。

## 分层约定

```text
AGENTS.md         硬规则 + 索引，保持短
ARCHITECTURE.md   结构、边界、数据流
playbooks/        可执行流程、验证方式、常见错误
REGRESSIONS.md    已发生的回归 + 预防方式
tests/            最终以自动化检查为准
```

文档不是法律。代码、测试和真实线上行为优先；发现不一致时，先修代码/测试，再更新文档。

## 维护规则

- 修完一个可复发的 bug：补测试，并在 `REGRESSIONS.md` 加一行；
- 新增固定流程：补对应 playbook；
- 架构/边界变化：更新 `ARCHITECTURE.md`；
- 一次性实现细节不写文档；
- 文档内结论尽量带文件路径；不确定的标 `待确认`；
- 文档变长时拆分，不要继续堆进 `AGENTS.md`。
