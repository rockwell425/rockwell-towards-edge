# 自动测试

在本目录执行：

```bash
node test-chatgpt-archive.js
node test-chatgpt-scale.js
node test-chatgpt-media.js
node test-chatgpt-media-resolver.js
```

覆盖：

- ChatGPT 活动分支过滤、代码块与具体模型名称；
- DOM 与服务器档案消息合并；
- 5000 条消息规模；
- 用户图片、AI 生成图片和隐藏 `tool/image_gen` 媒体；
- `sediment://` 资源指针到 ChatGPT 文件下载接口的后台解析。
