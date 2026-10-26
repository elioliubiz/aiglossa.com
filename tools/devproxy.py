#!/usr/bin/env python3
"""本地开发代理：静态文件 + /api/* 转发到 dev 后端。

为什么要它：登录态存在 cookie 里，作用域是 .aiglossa.com。
浏览器在 localhost 下会丢弃这种 cookie，于是本地永远「登录不上」。
代理让浏览器把请求看成同源 /api/*，cookie 就落在 localhost 名下——
和 Vite 的 server.proxy 是同一件事，只是这里是纯静态站点。

用法：
    python3 tools/devproxy.py --site root --port 8301
    python3 tools/devproxy.py --site tools --port 8000
"""
import argparse
import http.client
import http.server
import pathlib
import socket
import socketserver
import ssl
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent / "sites"
UPSTREAM = "dev.aiglossa.com"


class Handler(http.server.SimpleHTTPRequestHandler):

    def _proxy(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        target = parsed.path[len("/api"):] or "/"
        if parsed.query:
            target += "?" + parsed.query

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length) if length else None

        conn = http.client.HTTPSConnection(UPSTREAM, timeout=120, context=ssl.create_default_context())
        headers = {k: v for k, v in self.headers.items()
                   if k.lower() not in ("host", "origin", "referer", "content-length", "accept-encoding")}
        headers["Host"] = UPSTREAM
        headers["Origin"] = f"https://{UPSTREAM}"
        headers["Referer"] = f"https://{UPSTREAM}/"
        conn.request(self.command, target, body=body, headers=headers)
        resp = conn.getresponse()
        data = resp.read()

        self.send_response(resp.status)
        for key, value in resp.getheaders():
            low = key.lower()
            if low in ("transfer-encoding", "connection", "content-encoding", "content-length", "date", "server"):
                continue
            if low == "set-cookie":
                # 本地是 http、且主机是 localhost：去掉 Domain 与 Secure，
                # 否则浏览器会直接丢弃这个 cookie
                value = value.replace("; Domain=.aiglossa.com", "").replace("; domain=.aiglossa.com", "")
                value = value.replace("; Secure", "").replace("; secure", "")
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._proxy()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._proxy()
        self.send_error(405)

    def do_OPTIONS(self):
        if self.path.startswith("/api/"):
            return self._proxy()
        self.send_error(405)

    def log_message(self, fmt, *args):
        pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", choices=["root", "tools", "scholan"], default="root")
    ap.add_argument("--port", type=int, default=8301)
    args = ap.parse_args()

    site_dir = str(ROOT / args.site)

    def factory(*a, **kw):
        return Handler(*a, directory=site_dir, **kw)

    # 同时监听 IPv6 与 IPv4：macOS 上 localhost 常解析到 ::1，
    # 只绑 127.0.0.1 会导致 http://localhost:PORT 打不开。
    class DualStack(socketserver.TCPServer):
        address_family = socket.AF_INET6
        allow_reuse_address = True

        def server_bind(self):
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
            super().server_bind()

    with DualStack(("::", args.port), factory) as httpd:
        print(f"serving sites/{args.site} on http://localhost:{args.port}  (api → {UPSTREAM})")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
