# SEO 发布与 IndexNow

## 搜索引擎资产

生产站点分别作为独立网站添加到搜索引擎后台，并分别提交根目录的 `sitemap.xml`。staging 不提交。

## IndexNow

统一公开 Key 保存在 `tools/indexnow-key.txt`。`tools/build.py` 会把同名验证文件写入五个 `sites/<site>/` 根目录；同一个 Key 可以跨 host 使用，但每个 host 都必须能直接访问自己的验证文件。

发布生产后先确认验证文件返回 `200`，再预览提交范围：

```bash
python3 tools/submit_indexnow.py
```

确认无误后实际提交：

```bash
python3 tools/submit_indexnow.py --submit
```

提交工具只读取生产 `sites.json` host 和各站 sitemap，不会提交 staging、分享页或其他 noindex 页面。IndexNow 用于通知新增、修改和删除，不要把未变化 URL 当作定时任务反复提交。
