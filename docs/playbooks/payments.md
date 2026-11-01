# Creem 支付与额度

> 最后核对：2026-11-01  
> 密钥、商品 ID、webhook secret 只在后端环境，不在本仓库。

## 环境

```text
production
  CREEM_BASE=https://api.creem.io/v1
  正式 Key / 正式商品 / glossa_api_db

staging
  CREEM_BASE=https://test-api.creem.io/v1
  测试 Key / 测试商品 / glossa_dev_db
```

## 标准流程

```text
已登录用户
→ POST /wallet/checkout {credits}
→ 后端按 credits 查服务端商品映射
→ Creem 创建 checkout
→ 本地落 pending 订单（checkout id 唯一）
→ 用户完成支付
→ Creem webhook
→ 验签 + 按 checkout id 反查订单
→ 幂等加额度
```

客户端永远不传商品 ID，也不接触 Creem API Key。

## 安全规则

1. `CREEM_API_KEY` / `CREEM_WEBHOOK_SECRET` 只能在后端环境变量；前端只能拿到 `checkout_url`。
2. 商品 ID 与 credits 映射只在服务端；客户端不能改价格/额度。
3. webhook 必须用**原始请求体**验 HMAC-SHA256；不能先反序列化再重算。
4. 加币必须幂等：checkout id 唯一、`status=paid` 短路、`idempotency_key=creem:<order_id>`。
5. `success_url` 只允许当前 Origin + `WEB_ORIGINS` 白名单。
6. checkout 创建按用户/IP 限流。
7. 公开 staging 必须关闭 checkout：

```text
/opt/glossa-dev/.env
CREEM_CHECKOUT_ENABLED=false
```

生产不设置该变量，默认开启。  
只隐藏前端按钮不算禁用；后端必须返回 403。

## 测试支付

需要临时测试时：

```text
1. 确认 staging 没有公开访问风险
2. /opt/glossa-dev/.env 设 CREEM_CHECKOUT_ENABLED=true
3. systemctl restart glossa-dev
4. 测试
5. 立刻恢复 false 并重启
```

不要把测试开关带进生产 `.env`。

## 关键文件

```text
project/dev-glossa/app/config.py
project/dev-glossa/app/creem.py
project/dev-glossa/app/routers/ai_music.py
project/dev-glossa/app/routers/creem_webhook.py
project/aiglossa.com/assets/wallet.js
project/aiglossa.com/tools/templates/pages/account.html
```

## 不做

- 不在浏览器存 API Key；
- 不用 Creem 测试模式当作访问控制；
- 不根据前端成功回调直接加币；
- 不让 `success_url` 指向任意外部站点。
