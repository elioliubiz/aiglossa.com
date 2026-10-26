#!/usr/bin/env python3
"""通过 Chrome DevTools Protocol 读取页面：执行 JS / 截图 / 抓控制台。

用法：
    python3 tools/cdp.py eval "document.title"
    python3 tools/cdp.py shot /tmp/x.png
    python3 tools/cdp.py console
"""
import base64
import json
import sys
import time
import urllib.request

import websocket

PORT = 9333


def page_target():
    data = json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list"))
    pages = [t for t in data if t["type"] == "page" and "localhost" in t["url"] or t["type"] == "page"]
    for t in pages:
        if t["type"] == "page" and t["url"].startswith("http"):
            return t
    for t in data:
        if t["type"] == "page":
            return t
    raise SystemExit("没有可用的页面")


class CDP:
    def __init__(self):
        t = page_target()
        self.ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=30)
        self.i = 0

    def send(self, method, **params):
        self.i += 1
        self.ws.send(json.dumps({"id": self.i, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.i:
                return msg

    def eval(self, expr):
        r = self.send("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        res = r.get("result", {}).get("result", {})
        return res.get("value", res.get("description"))

    def shot(self, path):
        r = self.send("Page.captureScreenshot", format="png")
        with open(path, "wb") as f:
            f.write(base64.b64decode(r["result"]["data"]))
        return path


def main():
    c = CDP()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "eval"
    if cmd == "eval":
        print(json.dumps(c.eval(sys.argv[2]), ensure_ascii=False, indent=2))
    elif cmd == "shot":
        print(c.shot(sys.argv[2] if len(sys.argv) > 2 else "/tmp/cdp.png"))
    elif cmd == "console":
        c.send("Runtime.enable")
        out = []
        end = time.time() + 3
        c.ws.settimeout(3)
        while time.time() < end:
            try:
                msg = json.loads(c.ws.recv())
            except Exception:
                break
            if msg.get("method") == "Runtime.consoleAPICalled":
                out.append(msg["params"].get("type") + ": " +
                           " ".join(str(a.get("value")) for a in msg["params"]["args"]))
            elif msg.get("method") == "Runtime.exceptionThrown":
                out.append("EXCEPTION: " + json.dumps(msg["params"]["exceptionDetails"])[:300])
        print("\n".join(out) or "(无控制台输出)")


if __name__ == "__main__":
    main()
