#!/usr/bin/env bash
# 部署工具站到测试服 https://dev.aiglossa.com
# 同一域名既服务静态站（/en/、/make.html…），也反代 API（/ai/、/auth/、/docs）。
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${HOST:-root@146.190.136.201}"
DEST="${DEST:-/var/www/glossa-dev-site}"

python3 tools/build.py
python3 tools/verify.py
rsync -az --delete sites/tools/ "$HOST:$DEST/"
# nginx worker 以 www-data 运行，需要可读权限
ssh "$HOST" "chmod -R a+rX $DEST"
echo "已部署：https://dev.aiglossa.com/en/"
